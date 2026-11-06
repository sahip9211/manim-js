import {writeFile} from 'node:fs/promises';
import {startTelemetry} from './telemetry.mjs';
import {snapshotSources} from './source-snapshot.mjs';
const selected=process.argv.find(x=>x.startsWith('--browser='))?.split('=')[1]??'native';
if(!['native','both','chromium','firefox'].includes(selected))throw new Error('Expected --browser=both|chromium|firefox, or omit for native');
const quick=process.argv.includes('--quick');
for(const engine of selected==='both'?['chromium','firefox']:[selected]) {
  const telemetry=await startTelemetry(`vortex-${engine}`);
  const result={experiment:'006-vortex3d',createdAt:new Date().toISOString(),engine,status:'running',validation:[],results:[],errors:[]};
  result.sourceHashes=await snapshotSources(telemetry.directory,['experiments/vortex/model.js','experiments/vortex/shaders.js','experiments/vortex/webgpu.js','experiments/vortex/suite.js','experiments/fluid/fft-pressure.js','experiments/grid/model.js','scripts/bench-vortex.mjs','scripts/native-device.mjs','scripts/browser.mjs','scripts/firefox-bidi.mjs','scripts/test-workspace.mjs','scripts/telemetry.mjs','scripts/drm-stats.mjs','scripts/source-snapshot.mjs','package-lock.json']);
  let native,session;
  const save=()=>writeFile(`${telemetry.directory}/result.json`,JSON.stringify(result,null,2)+'\n');
  try {
    if(engine==='native') {
      const {nativeDevice}=await import('./native-device.mjs');native=await nativeDevice();Object.assign(result,native.metadata);
      native.device.addEventListener('uncapturederror',e=>result.errors.push(e.error.message));
      const {validateVortex,runVortexSuite,stabilityVortex}=await import('../experiments/vortex/suite.js');
      result.validation=await validateVortex(native.device);console.log(`${result.validation.length} 3D CPU/analytic checks passed`);await save();
      const suite=await runVortexSuite(native.device,{quick,onResult:async r=>{result.results.push(r);console.log(`${r.size}³ ${r.pressureKernel}: ${r.drainedMs.median.toFixed(3)} ms; error ${r.correctness.equivalence.maxAbsolute}`);await save();},onPreview:p=>writeFile(`${telemetry.directory}/preview.json`,JSON.stringify(p))});result.protocol=suite.protocol;
      result.stability=await stabilityVortex(native.device,{steps:quick?20:100});
    }else{
      const {openBrowser}=await import('./browser.mjs');session=await openBrowser({engine,headed:true,systemFirefox:true,experimentalWebGPU:true});
      session.page.on('pageerror',e=>result.errors.push(String(e)));
      const report=await session.page.evaluate(async({quick})=>{
        const adapter=await navigator.gpu?.requestAdapter();if(!adapter||adapter.info?.isFallbackAdapter)throw new Error('Hardware WebGPU adapter unavailable');
        const device=await adapter.requestDevice({requiredFeatures:adapter.features.has('timestamp-query')?['timestamp-query']:[]});
        const errors=[],report={errors,userAgent:navigator.userAgent,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description,isFallbackAdapter:adapter.info.isFallbackAdapter},results:[]};
        device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
        try {
          const {validateVortex,runVortexSuite,stabilityVortex}=await import('/experiments/vortex/suite.js');
          report.validation=await validateVortex(device);
          const suite=await runVortexSuite(device,{quick,onResult:r=>report.results.push(r),onPreview:p=>report.preview=p});report.protocol=suite.protocol;
          report.stability=await stabilityVortex(device,{steps:quick?20:100});
        }catch(error){report.failure=String(error.stack??error);}finally{device.destroy();}
        return report;
      },{quick});
      const {errors,preview,...data}=report;result.errors.push(...errors);Object.assign(result,data);
      if(preview)await writeFile(`${telemetry.directory}/preview.json`,JSON.stringify(preview));
      Object.assign(result,{browserVersion:session.browser.version(),launchArgs:session.args,preferences:session.preferences,automation:session.automation,windowPlacement:session.placement,pageVisibility:await session.page.evaluate(()=>document.visibilityState),experimentalWebGPU:true});
      if(result.failure)throw new Error(result.failure);
    }
    if(result.errors.length)throw new Error(result.errors.join('\n'));
    if(!result.stability?.passed)throw new Error('Stability failed');result.status='complete';
  }catch(error){result.status='failed';result.error=String(error.stack??error);process.exitCode=1;console.error(result.error);}
  finally{native?.device.destroy();await session?.browser.close();await save();await telemetry.stop({status:result.status});console.log(`${engine}: ${result.status} (${telemetry.directory})`);}
}
