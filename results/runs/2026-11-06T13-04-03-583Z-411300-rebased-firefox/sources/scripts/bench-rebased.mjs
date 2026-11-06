import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startTelemetry} from './telemetry.mjs';
import {snapshotSources} from './source-snapshot.mjs';
const selected=process.argv.find(x=>x.startsWith('--browser='))?.split('=')[1]??'native';
if(!['native','both','chromium','firefox'].includes(selected))throw new Error('Invalid browser');
const screen=process.argv.includes('--screen'),kernels=process.argv.find(x=>x.startsWith('--candidates='))?.slice(13).split(',')??['fft-real8-project','fft-real8-unrolled'];
const baseline=JSON.parse(await readFile('experiments/baselines/vortex-008.json'));
if(createHash('sha256').update(await readFile(baseline.file)).digest('hex')!==baseline.sha256)throw new Error('Frozen baseline hash mismatch');
for(const engine of selected==='both'?['chromium','firefox']:[selected]) {
  const telemetry=await startTelemetry(`rebased-${engine}`),result={experiment:'008-rebased',createdAt:new Date().toISOString(),engine,screen,baseline,status:'running',results:[],errors:[]};let native,session;
  result.sourceHashes=await snapshotSources(telemetry.directory,['experiments/baselines/vortex-008.js','experiments/baselines/vortex-008.json','experiments/vortex/rebased-suite.js','experiments/vortex/suite.js','experiments/vortex/model.js','experiments/vortex/shaders.js','experiments/vortex/webgpu.js','experiments/vortex/symmetry.js','experiments/vortex/symmetry-suite.js','experiments/fluid/fft-pressure.js','experiments/fluid/fft-stockham.js','experiments/fluid/fft-real.js','experiments/grid/model.js','scripts/bench-rebased.mjs','scripts/native-device.mjs','scripts/browser.mjs','scripts/firefox-bidi.mjs','scripts/test-workspace.mjs','scripts/telemetry.mjs','scripts/drm-stats.mjs','scripts/source-snapshot.mjs','package-lock.json']);
  const save=()=>writeFile(`${telemetry.directory}/result.json`,JSON.stringify(result,null,2)+'\n');
  try {
    if(engine==='native') {
      const {nativeDevice}=await import('./native-device.mjs');native=await nativeDevice();Object.assign(result,native.metadata);
      native.device.addEventListener('uncapturederror',e=>result.errors.push(e.error.message));
      const {runRebasedSuite}=await import('../experiments/vortex/rebased-suite.js');
      const suite=await runRebasedSuite(native.device,{screen,kernels,onValidation:async v=>{result.validation=v;console.log(`${v.length} reference checks passed`);await save();},onResult:async r=>{result.results.push(r);console.log(`${r.size}³ ${r.variant}: ${r.drainedMs.median.toFixed(3)} ms; error ${r.correctness.equivalence.maxAbsolute}`);await save();}});
      result.protocol=suite.protocol;result.stability=suite.stability;
    }else {
      const {openBrowser}=await import('./browser.mjs');session=await openBrowser({engine,headed:true,systemFirefox:true,experimentalWebGPU:true});session.page.on('pageerror',e=>result.errors.push(String(e)));
      const report=await session.page.evaluate(async({screen,kernels})=>{
        const adapter=await navigator.gpu?.requestAdapter();if(!adapter||adapter.info?.isFallbackAdapter)throw new Error('Hardware WebGPU unavailable');
        const device=await adapter.requestDevice({requiredFeatures:adapter.features.has('timestamp-query')?['timestamp-query']:[]}),errors=[];
        const report={results:[],errors,userAgent:navigator.userAgent,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description,isFallbackAdapter:adapter.info.isFallbackAdapter}};
        device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
        try {const {runRebasedSuite}=await import('/experiments/vortex/rebased-suite.js');const suite=await runRebasedSuite(device,{screen,kernels,onValidation:v=>report.validation=v,onResult:r=>report.results.push(r)});report.protocol=suite.protocol;report.stability=suite.stability;}
        catch(error){report.failure=String(error.stack??error);}finally{device.destroy();}return report;
      },{screen,kernels});
      const {errors,...data}=report;result.errors.push(...errors);Object.assign(result,data,{browserVersion:session.browser.version(),windowPlacement:session.placement,pageVisibility:await session.page.evaluate(()=>document.visibilityState),launchArgs:session.args,preferences:session.preferences,automation:session.automation,experimentalWebGPU:true});
      if(result.failure)throw new Error(result.failure);
    }
    if(result.errors.length)throw new Error(result.errors.join('\n'));result.status='complete';
  }catch(error){result.status='failed';result.error=String(error.stack??error);process.exitCode=1;console.error(result.error);}
  finally{native?.device.destroy();await session?.browser.close();await save();await telemetry.stop({status:result.status});console.log(`${engine}: ${result.status} (${telemetry.directory})`);}
}
