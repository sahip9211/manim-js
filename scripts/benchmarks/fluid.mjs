import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { nativeDevice } from '../lib/native-device.mjs';
import { startTelemetry } from '../lib/telemetry.mjs';
import { validateFluid, runFluidSuite } from '../../experiments/fluid/suite.js';
import { png } from '../lib/png.mjs';

const software = process.argv.includes('--software'),
  quick = process.argv.includes('--quick'),
  heavy = process.argv.includes('--heavy');
const telemetry = await startTelemetry(`fluid-${software ? 'software' : 'hardware'}`);
const result = {
  experiment: '003-fluid-advection-pressure',
  createdAt: new Date().toISOString(),
  status: 'running',
  validation: [],
  results: [],
  sourceHashes: {},
  errors: [],
  telemetryDirectory: telemetry.directory,
};
for (const path of [
  'experiments/fluid/model.js',
  'experiments/fluid/webgpu.js',
  'experiments/fluid/pressure-shaders.js',
  'experiments/fluid/suite.js',
  'scripts/benchmarks/fluid.mjs',
  'scripts/lib/telemetry.mjs',
])
  result.sourceHashes[path] = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
let native;
const save = () =>
  writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
await save();
try {
  native = await nativeDevice(software);
  Object.assign(result, native.metadata);
  native.device.addEventListener('uncapturederror', (e) => result.errors.push(e.error.message));
  result.validation = await validateFluid(native.device);
  const suite = await runFluidSuite(native.device, {
    quick,
    heavy,
    onResult: async (r) => {
      result.results.push(r);
      console.log(
        `fluid round ${r.round + 1} n=${r.size} wg=${r.workgroup[0]}: ${r.drainedMs.median.toFixed(3)} ms/step; divergence ${r.correctness.actual.divergenceRms.toExponential(3)}`,
      );
      await save();
    },
    onImage: (pixels, size, wg) =>
      writeFile(`${telemetry.directory}/fluid-${size}-wg${wg}.png`, png(pixels, size, size)),
  });
  result.protocol = suite.protocol;
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  result.status = 'complete';
} catch (error) {
  result.status = 'failed';
  result.error = String(error.stack ?? error);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  native?.device.destroy();
  result.errorRates = {
    gpuValidationErrors: result.errors.length,
    completedNumericalChecks: result.validation.length + result.results.length,
    failedCompletedNumericalChecks:
      result.validation.filter((x) => !x.passed).length +
      result.results.filter((x) => !x.correctness.passed).length,
    nonFiniteValues: result.results.reduce((s, x) => s + x.correctness.actual.nonFinite, 0),
    note: 'Counts refer to completed checks; a failed/aborted run is not a zero-error success.',
  };
  await save();
  await telemetry.stop({
    status: result.status,
    experiment: result.experiment,
    errorRates: result.errorRates,
  });
  console.log(`Saved ${telemetry.directory}`);
}
