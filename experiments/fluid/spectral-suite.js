import { createFluid } from './webgpu.js';
import { initialFluid, cpuProjection, fluidMetrics } from './model.js';
import { summarize, shuffled } from '../grid/model.js';

function difference(a, b) {
  let max = 0,
    sum = 0,
    scale = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    max = Math.max(max, Math.abs(d));
    sum += d * d;
    scale += b[i] * b[i];
  }
  return { maxAbsoluteDifference: max, relativeL2: Math.sqrt(sum / Math.max(scale, 1e-30)) };
}

export async function validateSpectral(device) {
  const checks = [];
  for (const size of [8, 16, 32, 64])
    for (const iterations of [1, 2, 3, 40, 80]) {
      const field = initialFluid(size);
      let seed = 12345;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          // Random modes, slow sinusoid and checkerboard test the full spectrum,
          // including mu=-1 where odd and even iteration counts differ.
          field[(y * size + x) * 4] +=
            seed / 4294967296 -
            0.5 +
            Math.sin((2 * Math.PI * x) / size) +
            ((x + y) % 2 ? 0.25 : -0.25);
        }
      const reference = cpuProjection(field, size, iterations);
      const solver = await createFluid(device, {
        size,
        iterations,
        dt: 0,
        pressureKernel: 'fft-jacobi',
      });
      try {
        solver.reset(field);
        solver.step();
        const actual = await solver.readState(),
          error = difference(actual, reference),
          metrics = fluidMetrics(actual, size);
        const check = {
          size,
          iterations,
          ...error,
          passed:
            Number.isFinite(error.maxAbsoluteDifference) &&
            error.maxAbsoluteDifference < 2e-5 &&
            metrics.nonFinite === 0,
        };
        checks.push(check);
        if (!check.passed) throw new Error(`FFT reference failed: ${JSON.stringify(check)}`);
      } finally {
        solver.dispose();
      }
    }
  return checks;
}

export async function runSpectralSuite(
  device,
  { quick = false, heavy = false, onResult = () => {} } = {},
) {
  const sizes = quick ? [64] : heavy ? [256, 512] : [128, 256],
    rounds = quick ? 1 : 3,
    batches = quick ? 2 : 4,
    frames = quick ? 2 : 3,
    iterations = 80,
    workgroup = 8;
  const results = [];
  for (let round = 0; round < rounds; round++)
    for (const size of sizes) {
      const states = new Map(),
        pair = [];
      for (const pressureKernel of shuffled(
        ['packed4-readonly', 'fft-jacobi'],
        501 + size + round * 19,
      )) {
        const start = performance.now(),
          solver = await createFluid(device, { size, iterations, workgroup, pressureKernel }),
          setupMs = performance.now() - start;
        try {
          for (let i = 0; i < 3; i++) solver.step();
          await device.queue.onSubmittedWorkDone();
          solver.reset();
          const drained = [],
            submission = [],
            gpu = [];
          for (let b = 0; b < batches; b++) {
            const t = performance.now();
            for (let i = 0; i < frames; i++) solver.step();
            submission.push((performance.now() - t) / frames);
            await device.queue.onSubmittedWorkDone();
            drained.push((performance.now() - t) / frames);
            gpu.push(await solver.timing());
          }
          const actual = await solver.readState(),
            metrics = fluidMetrics(actual, size),
            advected = fluidMetrics(await solver.readAdvected(), size),
            initial = fluidMetrics(initialFluid(size), size);
          const pixels = await solver.readPixels();
          let litPixels = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 10) litPixels++;
          states.set(pressureKernel, actual);
          const passed =
            metrics.nonFinite === 0 &&
            metrics.dyeMin >= -1e-6 &&
            metrics.dyeMax <= initial.dyeMax + 1e-5 &&
            metrics.divergenceRms <= advected.divergenceRms + 1e-5 &&
            litPixels > size * size * 0.01;
          const record = {
            round,
            ...solver.metadata,
            setupMs,
            steps: solver.steps,
            drainedMs: summarize(drained),
            submissionMs: summarize(submission),
            samples: { drained, submission, gpu },
            correctness: {
              passed,
              actual: metrics,
              advected,
              initial,
              litPixels,
              dyeMassRelativeDrift: (metrics.dyeMass - initial.dyeMass) / initial.dyeMass,
            },
          };
          pair.push(record);
          results.push(record);
        } finally {
          solver.dispose();
        }
      }
      for (const record of pair) {
        Object.assign(
          record.correctness,
          difference(states.get(record.pressureKernel), states.get('packed4-readonly')),
        );
        record.correctness.passed &&= record.correctness.maxAbsoluteDifference < 2e-5;
        await onResult(record);
      }
      if (pair.some((x) => !x.correctness.passed))
        throw new Error('FFT evolved-field equivalence or numerical gate failed');
    }
  return {
    results,
    protocol: {
      sizes,
      rounds,
      batches,
      frames,
      iterations,
      workgroup,
      warmupSteps: 3,
      seed: 501,
      maxAbsoluteDifference: 2e-5,
      note: 'Compare current packed4-readonly baseline to spectral evaluation of the same 80 Jacobi iterations. Same f32 field, dt, rendering and steps. Algorithmic rounding can differ; no lower iteration count or converged-solver substitution.',
    },
  };
}
