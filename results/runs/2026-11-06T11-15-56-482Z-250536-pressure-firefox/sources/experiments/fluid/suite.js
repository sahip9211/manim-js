import { initialFluid, fluidMetrics, cpuProjection } from './model.js';
import { createFluid } from './webgpu.js';
import { summarize, shuffled } from '../grid/model.js';

export async function validateFluid(device) {
  const checks = [], size = 16, iterations = 40;
  // Test projection independently from advection (dt=0).
  const field = initialFluid(size);
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) field[(y*size+x)*4] += Math.sin(6*Math.PI*x/size);
  const reference = cpuProjection(field,size,iterations), initialMetrics = fluidMetrics(field,size);
  const solver = await createFluid(device,{ size, iterations, dt: 0 });
  try {
    solver.reset(field); solver.step(); const actual = await solver.readState();
    let maxAbsoluteError = 0;
    for(let i=0;i<actual.length;i++) maxAbsoluteError = Math.max(maxAbsoluteError,Math.abs(actual[i]-reference[i]));
    const metrics = fluidMetrics(actual,size);
    const passed = metrics.nonFinite === 0 && maxAbsoluteError < 1e-5 && metrics.divergenceRms < initialMetrics.divergenceRms * 0.01;
    checks.push({ name: 'projection vs independent float64 CPU solver', passed, maxAbsoluteError, before: initialMetrics, after: metrics });
    if(!passed) throw new Error(JSON.stringify(checks.at(-1)));
  } finally { solver.dispose(); }
  const uniform = new Float32Array(size*size*4);
  for(let i=0;i<uniform.length;i+=4) uniform.set([1.25,-0.75,0.5,0],i);
  const transport = await createFluid(device,{ size,iterations,dt:1/60 });
  try {
    transport.reset(uniform); for(let i=0;i<4;i++) transport.step(); const actual=await transport.readState();
    let maxAbsoluteError=0; for(let i=0;i<actual.length;i++) maxAbsoluteError=Math.max(maxAbsoluteError,Math.abs(actual[i]-uniform[i]));
    const passed=Number.isFinite(maxAbsoluteError)&&maxAbsoluteError<1e-6;
    checks.push({name:'periodic transport preserves constant field',passed,maxAbsoluteError});
    if(!passed) throw new Error(JSON.stringify(checks.at(-1)));
  } finally { transport.dispose(); }
  return checks;
}

export async function runFluidSuite(device,{ quick=false,heavy=false,onResult=()=>{},onImage=null }={}) {
  const results=[],sizes=quick?[64]:heavy?[256,512]:[128,256], rounds=quick?1:3, batches=quick?2:5, frames=quick?2:4, iterations=heavy?80:40;
  for(let round=0;round<rounds;round++) for(const size of sizes) for(const workgroup of shuffled([8,16],2026+round+size)) {
    const t0=performance.now(); const solver=await createFluid(device,{size,iterations,workgroup}); const setupMs=performance.now()-t0;
    try {
      for(let i=0;i<3;i++) solver.step(); await device.queue.onSubmittedWorkDone(); solver.reset();
      const drained=[],submission=[],gpuSamples=[];
      for(let b=0;b<batches;b++) {
        const start=performance.now(); for(let i=0;i<frames;i++) solver.step(); submission.push((performance.now()-start)/frames);
        await device.queue.onSubmittedWorkDone(); drained.push((performance.now()-start)/frames); gpuSamples.push(await solver.timing());
      }
      const actual=fluidMetrics(await solver.readState(),size), advected=fluidMetrics(await solver.readAdvected(),size), initial=fluidMetrics(initialFluid(size),size);
      const dyeMassRelativeDrift=(actual.dyeMass-initial.dyeMass)/initial.dyeMass;
      const passed=actual.nonFinite===0&&actual.dyeMin>=-1e-6&&actual.dyeMax<=initial.dyeMax+1e-5&&actual.divergenceRms<=advected.divergenceRms+1e-5;
      const pixels=await solver.readPixels(); let litPixels=0; for(let i=0;i<pixels.length;i+=4) if(pixels[i]+pixels[i+1]+pixels[i+2]>10) litPixels++;
      if(litPixels<size*size*0.01) throw new Error('Fluid render is empty');
      const result={round,...solver.metadata,setupMs,steps:solver.steps,drainedMs:summarize(drained),submissionMs:summarize(submission),samples:{drained,submission,gpu:gpuSamples},correctness:{passed,initial,advected,actual,dyeMassRelativeDrift,litPixels}};
      results.push(result); await onResult(result);
      if(!passed) throw new Error(`Fluid numerical gate failed: ${JSON.stringify(result.correctness)}`);
      if(onImage&&round===0) await onImage(pixels,size,workgroup);
    } finally { solver.dispose(); }
  }
  return {results,protocol:{sizes,rounds,batches,frames,iterations,seed:2026,warmupSteps:3,dt:1/60,note:'Same simulated steps, initial state and solver accuracy for both workgroup sizes. Timing readbacks occur outside measured batches. Fixed Jacobi iteration count is an approximate solve, not guaranteed convergence.'}};
}
