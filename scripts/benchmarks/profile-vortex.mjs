import { writeFile } from 'node:fs/promises';
import { nativeDevice } from '../lib/native-device.mjs';
import { startTelemetry } from '../lib/telemetry.mjs';
import { snapshotSources } from '../lib/source-snapshot.mjs';
import { createVortex } from '../../experiments/vortex/webgpu.js';
import { difference } from '../../experiments/vortex/model.js';
const kernel = process.argv.find((x) => x.startsWith('--kernel='))?.split('=')[1] ?? 'fft-jacobi';
const telemetry = await startTelemetry('vortex-profile'),
  result = { experiment: '007-vortex-profile', status: 'running', errors: [], results: [] };
let native;
result.sourceHashes = await snapshotSources(telemetry.directory, [
  'scripts/benchmarks/profile-vortex.mjs',
  'experiments/vortex/webgpu.js',
  'experiments/vortex/symmetry.js',
  'experiments/vortex/symmetry-suite.js',
  'experiments/vortex/shaders.js',
  'experiments/vortex/model.js',
  'experiments/fluid/fft-pressure.js',
  'experiments/fluid/fft-stockham.js',
  'experiments/fluid/fft-real.js',
  'scripts/lib/native-device.mjs',
  'scripts/lib/telemetry.mjs',
  'scripts/lib/drm-stats.mjs',
]);
try {
  native = await nativeDevice();
  Object.assign(result, native.metadata);
  native.device.addEventListener('uncapturederror', (e) => result.errors.push(e.error.message));
  for (const size of [64, 128]) {
    let expected;
    for (const workgroup of [
      [4, 4, 4],
      [32, 2, 1],
      [8, 8, 1],
      [64, 1, 1],
    ]) {
      const solver = await createVortex(native.device, {
        size,
        workgroup,
        pressureKernel: kernel,
        profileStages: true,
      });
      try {
        for (let i = 0; i < 2; i++) solver.step();
        await native.device.queue.onSubmittedWorkDone();
        solver.reset();
        const samples = [];
        for (let i = 0; i < 4; i++) {
          const t = performance.now();
          solver.step();
          const submissionMs = performance.now() - t;
          await native.device.queue.onSubmittedWorkDone();
          const drainedMs = performance.now() - t;
          samples.push({ ...(await solver.timing()), submissionMs, drainedMs });
        }
        const actual = await solver.readState();
        expected ??= actual;
        const error = difference(actual, expected);
        if (error.maxAbsolute > 2e-5) throw new Error('Workgroup changes field');
        const row = { ...solver.metadata, samples, error };
        result.results.push(row);
        console.log(
          size,
          workgroup,
          samples.map((x) => x.stages),
        );
      } finally {
        solver.dispose();
      }
    }
  }
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  result.status = 'complete';
} catch (error) {
  result.status = 'failed';
  result.error = String(error.stack ?? error);
  process.exitCode = 1;
  console.error(result.error);
} finally {
  native?.device.destroy();
  await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2));
  await telemetry.stop({ status: result.status });
  console.log(telemetry.directory);
}
