import { writeFile } from 'node:fs/promises';
import { nativeDevice } from './native-device.mjs';
import { startTelemetry } from './telemetry.mjs';
import { snapshotSources } from './source-snapshot.mjs';
import { createFluid } from '../experiments/fluid/webgpu.js';
import { shuffled } from '../experiments/grid/model.js';

const telemetry = await startTelemetry('fluid-stage-profile');
const result = { status: 'running', errors: [], results: [], note: 'Diagnostic split passes add boundaries; compare stages within this profile, not summed durations against ordinary runs.' };
result.sourceHashes = await snapshotSources(telemetry.directory, ['scripts/profile-fluid.mjs','scripts/native-device.mjs','scripts/telemetry.mjs','scripts/drm-stats.mjs','experiments/fluid/webgpu.js','experiments/fluid/pressure-shaders.js','experiments/fluid/model.js','experiments/grid/model.js']);
let native;
try {
  native = await nativeDevice(); Object.assign(result, native.metadata);
  native.device.addEventListener('uncapturederror', e => result.errors.push(e.error.message));
  for (let round = 0; round < 3; round++) for (const workgroup of [8,16]) {
    for (const pressureKernel of shuffled(['direct','packed4','packed8'], 36 + round + workgroup)) {
      const options = { size: 512, iterations: 80, workgroup, pressureKernel };
      const reference = await createFluid(native.device, options);
      const solver = await createFluid(native.device, { ...options, profileStages: true });
      try {
        reference.step(); solver.step();
        const expected = await reference.readState(), actual = await solver.readState();
        let difference = 0;
        for (let i=0;i<expected.length;i++) difference = Math.max(difference, Math.abs(expected[i]-actual[i]));
        if (!Number.isFinite(difference) || difference > 2e-5) throw new Error(`Profile differs from ordinary pass: ${difference}`);
        for (let i=0;i<3;i++) solver.step(); await native.device.queue.onSubmittedWorkDone();
        const samples = [];
        for (let i=0;i<4;i++) { solver.step(); samples.push(await solver.timing()); }
        result.results.push({ round, ...options, profileStages: true, maxAbsoluteDifference: difference, samples });
      } finally { reference.dispose(); solver.dispose(); }
    }
  }
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  result.status = 'complete';
} catch (error) { result.status = 'failed'; result.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  native?.device.destroy();
  await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result,null,2)+'\n');
  await telemetry.stop({ status: result.status }); console.log(`${result.status}: ${telemetry.directory}`);
}
