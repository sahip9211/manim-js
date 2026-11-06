import { makeGrid, summarize, shuffled } from './model.js';
import { createGridRenderer, strategies } from './webgpu.js';

export async function validateRenderers(device, onImage = () => {}) {
  const checks = [];
  const width = 640,
    height = 480;
  device.pushErrorScope('validation');
  for (const size of [17, 65])
    for (const [phase, amplitude] of [
      [0, 0],
      [0.8, 0.25],
      [2.4, -0.25],
    ]) {
      const grid = makeGrid(size);
      let reference;
      for (const strategy of strategies) {
        const renderer = await createGridRenderer(device, grid, strategy, { width, height });
        renderer.draw(phase, amplitude);
        const pixels = await renderer.readPixels();
        if (!reference) reference = pixels;
        let changed = 0,
          foreground = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 1] > 100) foreground++;
          if (
            Math.abs(pixels[i] - reference[i]) +
              Math.abs(pixels[i + 1] - reference[i + 1]) +
              Math.abs(pixels[i + 2] - reference[i + 2]) >
            12
          )
            changed++;
        }
        const mismatchFraction = changed / (width * height);
        if (foreground < 3000 || mismatchFraction > 0.005)
          throw new Error(
            `Pixel validation failed: ${strategy} n=${size}, mismatch=${mismatchFraction}, foreground=${foreground}`,
          );
        const check = {
          size,
          phase,
          amplitude,
          strategy,
          foreground,
          changedPixels: changed,
          mismatchFraction,
        };
        if (strategy.startsWith('compute')) {
          const positions = await renderer.readComputedPositions();
          let maxError = 0;
          for (let i = 0; i < positions.length; i += 2) {
            const x = grid.rest[i],
              y = grid.rest[i + 1];
            const expected = x + Math.fround(amplitude) * Math.sin(3 * y + Math.fround(phase));
            maxError = Math.max(
              maxError,
              Math.abs(positions[i] - expected),
              Math.abs(positions[i + 1] - y),
            );
          }
          // sin(f32) allows absolute error 2^-11 on [-pi,pi] in WGSL.
          // With amplitude <= .25, budget .25*2^-11 + f32 arithmetic margin.
          // Basis variant has no GPU trig and is held to a tighter threshold.
          const tolerance = strategy === 'compute-basis' ? 2e-6 : 1.3e-4;
          if (maxError > tolerance) throw new Error(`Compute coordinates incorrect: ${maxError}`);
          check.coordinateTolerance = tolerance;
          check.maxCoordinateError = maxError;
        }
        if (size === 17 && phase === 0.8) await onImage(strategy, pixels, width, height);
        checks.push(check);
        renderer.dispose();
      }
    }
  await device.queue.onSubmittedWorkDone();
  const error = await device.popErrorScope();
  if (error) throw new Error(`WebGPU validation: ${error.message}`);
  return {
    tolerance: {
      fractionOfPixels: 0.005,
      changedPixelRGBL1: 12,
      builtinTrigCoordinates: 1.3e-4,
      basisCoordinates: 2e-6,
    },
    checks,
  };
}

export async function runSuite(
  device,
  {
    sizes = [32, 128, 256],
    rounds = 3,
    batchFrames = 12,
    measuredBatches = 5,
    warmupFrames = 24,
    onResult = () => {},
  } = {},
) {
  const results = [];
  device.pushErrorScope('validation');
  for (let round = 0; round < rounds; round++) {
    const cases = shuffled(
      sizes.flatMap((size) => strategies.map((strategy) => ({ size, strategy }))),
      991 + round,
    );
    for (const { size, strategy } of cases) {
      const grid = makeGrid(size);
      const renderer = await createGridRenderer(device, grid, strategy, {
        timestampCapacity: batchFrames,
      });
      for (let i = 0; i < warmupFrames; i++) {
        renderer.draw(i * 0.03, 0.25);
        if ((i + 1) % batchFrames === 0) await device.queue.onSubmittedWorkDone();
      }
      await device.queue.onSubmittedWorkDone();
      const cpu = [],
        update = [],
        upload = [],
        encode = [],
        batches = [],
        gpuRender = [],
        gpuCompute = [];
      for (let batch = 0; batch < measuredBatches; batch++) {
        const start = performance.now();
        for (let frame = 0; frame < batchFrames; frame++) {
          const m = renderer.draw((batch * batchFrames + frame) * 0.03, 0.25, frame);
          cpu.push(m.updateMs + m.uploadMs + m.encodeMs);
          update.push(m.updateMs);
          upload.push(m.uploadMs);
          encode.push(m.encodeMs);
        }
        // Intentional batch boundary. This metric includes draining the queue,
        // not GPU pass time, display cadence, or interactive frame latency.
        await device.queue.onSubmittedWorkDone();
        batches.push((performance.now() - start) / batchFrames);
        // Query resolve and readback excluded from the drained batch wall time.
        const times = await renderer.timestamps(batchFrames);
        if (times)
          for (const t of times) {
            gpuRender.push(t.renderMs);
            gpuCompute.push(t.computeMs);
          }
      }
      const result = {
        round,
        ...renderer.metadata,
        cpuMs: summarize(cpu),
        updateMs: summarize(update),
        uploadCallMs: summarize(upload),
        encodeSubmitMs: summarize(encode),
        drainedBatchMsPerFrame: summarize(batches),
        gpuRenderPassMs: summarize(gpuRender),
        gpuComputePassMs: summarize(gpuCompute),
        samples: { cpu, update, upload, encode, drainedBatches: batches, gpuRender, gpuCompute },
      };
      results.push(result);
      renderer.dispose();
      await onResult(result);
    }
  }
  const error = await device.popErrorScope();
  if (error) throw new Error(`WebGPU validation: ${error.message}`);
  return {
    config: {
      sizes,
      rounds,
      batchFrames,
      measuredBatches,
      warmupFrames,
      seed: 991,
      width: 640,
      height: 480,
      sampleCount: 1,
      primitive: 'indexed line-list',
      indexType: 'uint16 for <=65536 vertices, uint32 otherwise',
    },
    results,
  };
}
