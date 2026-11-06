import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTelemetry } from './telemetry.mjs';
import { snapshotSources } from './source-snapshot.mjs';
const localBrowsers=fileURLToPath(new URL('../vendor/playwright',import.meta.url));
if(existsSync(localBrowsers)) process.env.PLAYWRIGHT_BROWSERS_PATH??=localBrowsers;
const {openBrowser}=await import('./browser.mjs');
const selected=process.argv.find(x=>x.startsWith('--browser='))?.split('=')[1]??'both';
if(!['both','chromium','firefox'].includes(selected)) throw new Error('Expected --browser=both|chromium|firefox');
const software=process.argv.includes('--software'),quick=process.argv.includes('--quick'),heavy=process.argv.includes('--heavy');
const layouts=process.argv.includes('--layouts'),packed=process.argv.includes('--packed'),candidates=process.argv.includes('--candidates');
const pressure=process.argv.includes('--pressure'),includeTiled=process.argv.includes('--include-tiled');
const experimentalWebGPU=process.argv.includes('--experimental-webgpu');
for(const engine of selected==='both'?['chromium','firefox']:[selected]){
  const telemetry=await startTelemetry(`${pressure?'pressure':'fluid'}-${engine}`);let session,result;
  const sourceHashes=await snapshotSources(telemetry.directory,['experiments/fluid/model.js','experiments/fluid/webgpu.js','experiments/fluid/pressure-shaders.js','experiments/fluid/suite.js','experiments/fluid/pressure-suite.js','experiments/grid/model.js','scripts/bench-fluid-browser.mjs','scripts/browser.mjs','scripts/firefox-bidi.mjs','scripts/test-workspace.mjs','scripts/telemetry.mjs','scripts/drm-stats.mjs','scripts/source-snapshot.mjs','package-lock.json']);
  try{
    // Firefox gets no Chromium-specific flags; software fallback is labeled from adapter metadata.
    session=await openBrowser({engine,headed:process.argv.includes('--headed'),software:software&&engine==='chromium',experimentalWebGPU,systemFirefox:process.argv.includes('--system-firefox')});
    const pageErrors=[];session.page.on('pageerror',e=>pageErrors.push(String(e)));
    result=await session.page.evaluate(async({software,quick,heavy,pressure,includeTiled,candidates,packed,layouts})=>{
      const adapter=await navigator.gpu?.requestAdapter();
      if(!adapter)return{status:'unavailable',reason:'WebGPU adapter unavailable with the recorded launch configuration',userAgent:navigator.userAgent};
      const info=adapter.info;
      if(info?.isFallbackAdapter&&!software)throw new Error('Software adapter rejected for hardware run');
      const device=await adapter.requestDevice({requiredFeatures:adapter.features.has('timestamp-query')?['timestamp-query']:[]});
      const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
      const report={status:'running',userAgent:navigator.userAgent,adapter:info?{vendor:info.vendor,architecture:info.architecture,description:info.description,isFallbackAdapter:info.isFallbackAdapter}:null,errors,results:[]};
      try{
        const fenceMs=[];
        for(let i=0;i<6;i++) { const start=performance.now();device.queue.submit([device.createCommandEncoder().finish()]);await device.queue.onSubmittedWorkDone();fenceMs.push(performance.now()-start); }
        report.synchronizationProbe={emptySubmissionCompletionMs:fenceMs,note:'Empty command buffer submission plus completion callback. Includes browser scheduling; not pure GPU execution or display latency.'};
        const suiteModule=pressure?await import('/experiments/fluid/pressure-suite.js'):await import('/experiments/fluid/suite.js');
        report.validation=await (pressure?suiteModule.validatePressureKernels:suiteModule.validateFluid)(device,{candidates,packed,layouts});
        const suite=await (pressure?suiteModule.runPressureSuite:suiteModule.runFluidSuite)(device,{quick,heavy,includeTiled,candidates,packed,layouts,onResult:r=>report.results.push(r)});report.protocol=suite.protocol;
        if(errors.length)throw new Error(errors.join('\n'));report.status='complete';
      }catch(error){report.status='failed';report.error=String(error.stack??error);}
      finally{device.destroy();}
      return report;
    },{software,quick,heavy,pressure,includeTiled,candidates,packed,layouts});
    result.browserVersion=session.browser.version();result.launchArgs=session.args;result.pageErrors=pageErrors;
    result.preferences=session.preferences;
    result.automation=session.automation;
    result.windowPlacement=session.placement;result.pageVisibility=await session.page.evaluate(()=>document.visibilityState);
    if(pageErrors.length)result.status='failed';
  }catch(error){result={status:session?'failed':'blocked',error:String(error.stack??error)};}
  finally{await session?.browser.close();}
  Object.assign(result,{engine,createdAt:new Date().toISOString(),experiment:pressure?'004-pressure-browser':'003-fluid-browser',softwareRequested:software,experimentalWebGPU,sourceHashes,telemetryDirectory:telemetry.directory});
  await writeFile(`${telemetry.directory}/result.json`,JSON.stringify(result,null,2)+'\n');await telemetry.stop({status:result.status,engine,experiment:result.experiment});
  console.log(`${engine}: ${result.status} (${telemetry.directory})`);if(result.status!=='complete')process.exitCode=1;
}
