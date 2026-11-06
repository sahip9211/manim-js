import { writeFile } from 'node:fs/promises';
import { nativeDevice } from '../lib/native-device.mjs';
import { startTelemetry } from '../lib/telemetry.mjs';
import { snapshotSources } from '../lib/source-snapshot.mjs';
import { validateSpectral, runSpectralSuite } from '../../experiments/fluid/spectral-suite.js';
const telemetry = await startTelemetry('spectral-hardware');
const result = {
  experiment: '006-spectral-jacobi',
  createdAt: new Date().toISOString(),
  status: 'running',
  validation: [],
  results: [],
  errors: [],
};
result.sourceHashes = await snapshotSources(telemetry.directory, [
  'experiments/fluid/fft-pressure.js',
  'experiments/fluid/spectral-suite.js',
  'experiments/fluid/webgpu.js',
  'experiments/fluid/pressure-shaders.js',
  'experiments/fluid/model.js',
  'experiments/grid/model.js',
  'scripts/benchmarks/spectral.mjs',
  'scripts/lib/native-device.mjs',
  'scripts/lib/telemetry.mjs',
  'scripts/lib/drm-stats.mjs',
  'package-lock.json',
]);
let native;
const save = () =>
  writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
try {
  native = await nativeDevice();
  Object.assign(result, native.metadata);
  native.device.addEventListener('uncapturederror', (e) => result.errors.push(e.error.message));
  result.validation = await validateSpectral(native.device);
  console.log(`${result.validation.length} spectral reference checks passed`);
  const suite = await runSpectralSuite(native.device, {
    quick: process.argv.includes('--quick'),
    heavy: process.argv.includes('--heavy'),
    onResult: async (r) => {
      result.results.push(r);
      console.log(
        `${r.size} ${r.pressureKernel}: ${r.drainedMs.median.toFixed(3)} ms; error ${r.correctness.maxAbsoluteDifference}`,
      );
      await save();
    },
  });
  result.protocol = suite.protocol;
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  result.status = 'complete';
} catch (error) {
  result.status = 'failed';
  result.error = String(error.stack ?? error);
  process.exitCode = 1;
  console.error(result.error);
} finally {
  native?.device.destroy();
  await save();
  await telemetry.stop({ status: result.status });
  console.log(`Saved ${telemetry.directory}`);
}
