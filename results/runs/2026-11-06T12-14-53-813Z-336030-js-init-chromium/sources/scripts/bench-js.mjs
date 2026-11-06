import {writeFile} from 'node:fs/promises';
import {PerformanceObserver} from 'node:perf_hooks';
import {startTelemetry} from './telemetry.mjs';
import {snapshotSources} from './source-snapshot.mjs';
const selected=process.argv.find(x=>x.startsWith('--browser='))?.split('=')[1]??'native';
if(!['native','both','chromium','firefox'].includes(selected))throw new Error('Invalid browser');
for(const engine of selected==='both'?['chromium','firefox']:[selected]) {
  const telemetry=await startTelemetry(`js-init-${engine}`),result={engine,experiment:'007-js-initialization',status:'running',errors:[]},gc=[];let session;
  const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())gc.push({startTime:e.startTime,duration:e.duration,kind:e.detail.kind});});observer.observe({entryTypes:['gc']});
  result.sourceHashes=await snapshotSources(telemetry.directory,['scripts/bench-js.mjs','experiments/vortex/js-suite.js','experiments/vortex/js-baseline.js','experiments/vortex/model.js','experiments/grid/model.js','scripts/telemetry.mjs','scripts/drm-stats.mjs','scripts/browser.mjs','scripts/firefox-bidi.mjs','scripts/test-workspace.mjs']);
  try {
    if(engine==='native') {
      const {runInitializationSuite}=await import('../experiments/vortex/js-suite.js');Object.assign(result,await runInitializationSuite());result.engineVersion=process.versions.v8;
      await new Promise(resolve=>setImmediate(resolve));
    }else {
      const {openBrowser}=await import('./browser.mjs');session=await openBrowser({engine,headed:true,systemFirefox:true});session.page.on('pageerror',e=>result.errors.push(String(e)));
      Object.assign(result,await session.page.evaluate(async()=>{const {runInitializationSuite}=await import('/experiments/vortex/js-suite.js');return {...await runInitializationSuite(),userAgent:navigator.userAgent,pageVisibility:document.visibilityState,browserHeap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null};}));
      result.browserVersion=session.browser.version();result.windowPlacement=session.placement;
    }
    if(result.errors.length)throw new Error(result.errors.join('\n'));result.status='complete';
  }catch(error){result.status='failed';result.error=String(error.stack??error);process.exitCode=1;}
  finally{await session?.browser.close();observer.disconnect();result.runnerGC=gc;result.gcScope='Node runner only; browser GC not exposed by a portable page API';await writeFile(`${telemetry.directory}/result.json`,JSON.stringify(result,null,2));await telemetry.stop({status:result.status});console.log(engine,result.status,telemetry.directory);}
}
