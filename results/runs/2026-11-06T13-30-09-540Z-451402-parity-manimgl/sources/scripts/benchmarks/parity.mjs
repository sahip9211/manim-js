import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {startTelemetry} from '../lib/telemetry.mjs';
import {snapshotSources} from '../lib/source-snapshot.mjs';
import {openBrowser} from '../lib/browser.mjs';
import {png} from '../lib/png.mjs';
const exec=promisify(execFile);
const quick=process.argv.includes('--quick');
const python=process.env.MANIM_JS_PYTHON??'vendor/manimgl-venv/bin/python';
const requested=process.argv.find(x=>x.startsWith('--browser='))?.slice(10)??'both';
const sourceFiles=['experiments/parity/reference.py','experiments/parity/workload.json','experiments/parity/browser-suite.js','src/surface/model.js','src/surface/shaders.js','src/surface/webgl2.js','scripts/benchmarks/parity.mjs','scripts/lib/browser.mjs','scripts/lib/firefox-bidi.mjs','scripts/lib/test-workspace.mjs','scripts/lib/telemetry.mjs','scripts/lib/drm-stats.mjs','package-lock.json'];
const referenceTelemetry=await startTelemetry('parity-manimgl');
const referenceDirectory=referenceTelemetry.directory;
let reference;
try {
  const hashes=await snapshotSources(referenceDirectory,sourceFiles);
  const {stdout,stderr}=await exec(python,['experiments/parity/reference.py','--output',referenceDirectory,...(quick?['--quick']:[])],{maxBuffer:4*1024*1024});
  reference=JSON.parse(await readFile(`${referenceDirectory}/result.json`));
  reference.sourceHashes=hashes;
  reference.upstreamRevision=(await exec('git',['-C','vendor/manimgl','rev-parse','HEAD'])).stdout.trim();
  reference.pythonPackages=JSON.parse((await exec(python,['-c','import importlib.metadata,json; print(json.dumps(sorted([(d.metadata["Name"], d.version) for d in importlib.metadata.distributions()])))'])).stdout);
  reference.console=(stdout+stderr).replaceAll(process.cwd(),'/workspace/manim-js');
  await writeFile(`${referenceDirectory}/result.json`,JSON.stringify(reference,null,2)+'\n');
  console.log('ManimGL',reference.status,referenceDirectory);
} finally {await referenceTelemetry.stop({status:reference?.status??'failed'});}
if(reference.status!=='complete')throw new Error('Reference failed');
for(const engine of requested==='both'?['chromium','firefox']:[requested]) {
  const telemetry=await startTelemetry(`parity-${engine}`);
  let session;
  const result={experiment:'009-manim-parity',engine,status:'running',referenceDirectory,config:reference.config,cases:[],errors:[]};
  try {
    result.sourceHashes=await snapshotSources(telemetry.directory,sourceFiles);
    session=await openBrowser({engine,headed:true,systemFirefox:true});
    session.page.on('pageerror',e=>result.errors.push(String(e)));
    result.browserVersion=session.browser.version();result.windowPlacement=session.placement;result.launchArgs=session.args;
    result.geometry=await session.page.evaluate(async r=>(await import('/experiments/parity/browser-suite.js')).checkGeometry(r),reference);
    for(let round=0;round<reference.config.rounds;round++)for(const mode of round%2?['basis','direct']:['direct','basis']) {
      await session.page.evaluate(async ({config,camera,mode})=>{const suite=await import('/experiments/parity/browser-suite.js');globalThis.parityCase=suite.createCase(config,camera,mode);},{config:reference.config,camera:reference.camera,mode});
      if(round===0)for(let i=0;i<reference.config.validationPhases.length;i++) {
        const raw=await session.page.evaluate(async phase=>{const {rawBase64}=await import('/experiments/parity/browser-suite.js');parityCase.renderer.draw(phase);parityCase.renderer.finish();return rawBase64(parityCase.renderer.read());},reference.config.validationPhases[i]);
        await writeFile(`${telemetry.directory}/${mode}-${i}.png`,png(Buffer.from(raw,'base64'),reference.config.width,reference.config.height));
      }
      const row=await session.page.evaluate(async ({config,round})=>{const {benchmarkCase}=await import('/experiments/parity/browser-suite.js');const r=parityCase.renderer;const samples=await benchmarkCase(r,config,round);const row={...r.metadata,round,samples};r.dispose();return row;},{config:reference.config,round});
      result.cases.push(row);console.log(engine,mode,round,row.samples.map(x=>x.drainedMs.toFixed(3)).join(', '));
    }
    result.status=result.errors.length?'failed':'complete';
  }catch(error){result.status='failed';result.error=String(error.stack??error).replaceAll(process.cwd(),'/workspace/manim-js');process.exitCode=1;}
  finally{await session?.browser.close();await writeFile(`${telemetry.directory}/result.json`,JSON.stringify(result,null,2)+'\n');await telemetry.stop({status:result.status});console.log(engine,result.status,telemetry.directory);}
}
