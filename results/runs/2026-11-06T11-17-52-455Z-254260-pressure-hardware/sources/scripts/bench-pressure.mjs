import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { nativeDevice } from './native-device.mjs';
import { startTelemetry } from './telemetry.mjs';
import { validatePressureKernels,runPressureSuite } from '../experiments/fluid/pressure-suite.js';

const software=process.argv.includes('--software'),quick=process.argv.includes('--quick'),packed=process.argv.includes('--packed'),candidates=process.argv.includes('--candidates'),heavy=process.argv.includes('--heavy');
const telemetry=await startTelemetry(`pressure-${software?'software':'hardware'}`);
const result={experiment:'004-tiled-pressure',createdAt:new Date().toISOString(),status:'running',results:[],validation:[],errors:[],sourceHashes:{},telemetryDirectory:telemetry.directory};
// Preserve source bodies as well as hashes so later edits cannot erase the
// implementation associated with a measured result.
for(const path of ['experiments/fluid/model.js','experiments/fluid/webgpu.js','experiments/fluid/pressure-shaders.js','experiments/fluid/pressure-suite.js','experiments/grid/model.js','scripts/bench-pressure.mjs','scripts/native-device.mjs','scripts/telemetry.mjs','scripts/drm-stats.mjs','package-lock.json']) {
  const body=await readFile(path),destination=`${telemetry.directory}/sources/${path}`;
  result.sourceHashes[path]=createHash('sha256').update(body).digest('hex');await mkdir(dirname(destination),{recursive:true});await writeFile(destination,body);
}
let native;
const save=()=>writeFile(`${telemetry.directory}/result.json`,JSON.stringify(result,null,2)+'\n');
try {
  native=await nativeDevice(software);Object.assign(result,native.metadata);
  native.device.addEventListener('uncapturederror',event=>result.errors.push(event.error.message));
  result.validation=await validatePressureKernels(native.device,{candidates,packed});console.log(`${result.validation.length} pressure correctness checks passed`);
  const suite=await runPressureSuite(native.device,{quick,heavy,candidates,packed,includeTiled:process.argv.includes('--include-tiled'),onResult:async record=>{
    result.results.push(record);console.log(`round ${record.round+1} n=${record.size} wg=${record.workgroup[0]} ${record.pressureKernel}: ${record.drainedMs.median.toFixed(3)} ms/step; error ${record.correctness.maxAbsoluteDifference}`);await save();
  }});result.protocol=suite.protocol;
  if(result.errors.length)throw new Error(result.errors.join('\n'));result.status='complete';
}catch(error){result.status=native?'failed':'blocked';result.error=String(error.stack??error);process.exitCode=1;console.error(result.error);}
finally{native?.device.destroy();result.errorCounts={gpu:result.errors.length,completedChecks:result.validation.length+result.results.length,failedCompletedChecks:[...result.validation,...result.results.map(x=>x.correctness)].filter(x=>!x.passed).length};await save();await telemetry.stop({status:result.status,errorCounts:result.errorCounts});console.log(`Saved ${telemetry.directory}`);}
