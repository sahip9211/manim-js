import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { nativeDevice } from '../lib/native-device.mjs';
import { makeRepresentation } from '../../experiments/representation/model.js';
import { createRepresentationRenderer } from '../../experiments/representation/webgpu.js';
import { compareCoverage } from '../../experiments/representation/validation.js';
import { shuffled, summarize } from '../../experiments/grid/model.js';
import { startTelemetry } from '../lib/telemetry.mjs';

const software = process.argv.includes('--software');
const quick = process.argv.includes('--quick');
const telemetry = await startTelemetry(`representation-${software ? 'software' : 'hardware'}`);
const result = {
  experiment: '002-shared-geometry',
  status: 'running',
  createdAt: new Date().toISOString(),
  node: process.version,
  cpu: os.cpus()[0]?.model,
  validation: [],
  results: [],
  sourceHashes: {},
  notes: [
    'Same thin line-list shader and framebuffer across representations. No antialiasing.',
    'Timing includes queue-drained batches; not GPU timestamp, browser performance, or input latency.',
    'The bounded variant changes vertical tessellation with a declared analytic error bound.',
  ],
};
for (const path of [
  'experiments/representation/model.js',
  'experiments/representation/webgpu.js',
  'experiments/representation/validation.js',
  'scripts/benchmarks/representation.mjs',
])
  result.sourceHashes[path] = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
await mkdir('results', { recursive: true });
let native;
try {
  native = await nativeDevice(software);
  Object.assign(result, native.metadata);
  const { device } = native;
  const errors = [];
  device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
  for (const size of [33, 129])
    for (const phase of [0, 0.8, 2.4]) {
      let reference;
      for (const mode of ['expanded', 'instanced', 'bounded']) {
        const renderer = await createRepresentationRenderer(device, makeRepresentation(size, mode));
        try {
          renderer.draw(phase, phase === 2.4 ? -0.25 : 0.25);
          const pixels = await renderer.readPixels();
          if (!reference) reference = pixels;
          const coverage = compareCoverage(reference, pixels, 640, 480);
          result.validation.push({ size, phase, mode, coverage });
          if (!coverage.passed) throw new Error(`Coverage mismatch: ${size}/${phase}/${mode}`);
        } finally {
          renderer.dispose();
        }
      }
    }
  const batches = quick ? 2 : 6,
    frames = quick ? 3 : 8,
    rounds = quick ? 1 : 3;
  for (let round = 0; round < rounds; round++)
    for (const size of quick ? [128] : [128, 256]) {
      for (const mode of shuffled(['expanded', 'instanced', 'bounded'], 991 + round * 17 + size)) {
        const representation = makeRepresentation(size, mode);
        const start = performance.now();
        const renderer = await createRepresentationRenderer(device, representation);
        const setupMs = performance.now() - start;
        try {
          for (let i = 0; i < 12; i++) renderer.draw(i * 0.03);
          await device.queue.onSubmittedWorkDone();
          const drained = [],
            submission = [];
          for (let b = 0; b < batches; b++) {
            const t0 = performance.now();
            for (let i = 0; i < frames; i++) renderer.draw((b * frames + i) * 0.03);
            submission.push((performance.now() - t0) / frames);
            await device.queue.onSubmittedWorkDone();
            drained.push((performance.now() - t0) / frames);
          }
          result.results.push({
            round,
            size,
            mode,
            setupMs,
            ...renderer.metadata,
            drainedMs: summarize(drained),
            submissionMs: summarize(submission),
            samples: { drained, submission },
          });
          console.log(
            `${round + 1} n=${size} ${mode}: ${summarize(drained).median.toFixed(3)} ms/drained frame`,
          );
        } finally {
          renderer.dispose();
        }
      }
    }
  if (errors.length) throw new Error(errors.join('\n'));
  result.status = 'complete';
} catch (error) {
  result.status = 'failed';
  result.error = String(error.stack ?? error);
  process.exitCode = 1;
  console.error(result.error);
} finally {
  native?.device.destroy();
  result.telemetryDirectory = telemetry.directory;
  await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
  // Keep the original research run intact; new runs always have unique directories.
  await telemetry.stop({
    status: result.status,
    experiment: result.experiment,
    completedChecks: result.validation.length,
    failedChecks: result.validation.filter((x) => !x.coverage.passed).length,
  });
  console.log(`Saved ${telemetry.directory}`);
}
