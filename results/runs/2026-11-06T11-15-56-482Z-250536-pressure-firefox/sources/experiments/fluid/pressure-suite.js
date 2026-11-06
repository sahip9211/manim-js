import { createFluid } from './webgpu.js';
import { initialFluid, cpuProjection, fluidMetrics } from './model.js';
import { shuffled, summarize } from '../grid/model.js';

function maximumDifference(a,b) {
  let max=0; for(let i=0;i<a.length;i++) max=Math.max(max,Math.abs(a[i]-b[i])); return max;
}

export async function validatePressureKernels(device, { candidates = false, packed = false } = {}) {
  const checks=[];
  const kernels = packed ? ['direct','packed4'] : candidates ? ['direct','specialized','temporal-4','temporal-8'] : ['jacobi','direct','tiled-pair'];
  // Odd sizes exercise partial workgroups and periodic halos. Odd iteration
  // counts exercise the single-iteration tail and pressure-buffer parity.
  for(const size of [8,17,32]) for(const iterations of [1,3,40]) {
    const field=initialFluid(size);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) field[(y*size+x)*4]+=Math.sin(6*Math.PI*x/size);
    const reference=cpuProjection(field,size,iterations);
    for(const workgroup of [8,16]) for(const pressureKernel of kernels) {
      const solver=await createFluid(device,{size,iterations,workgroup,pressureKernel,dt:0});
      try {
        solver.reset(field);solver.step();const actual=await solver.readState();
        const maxAbsoluteError=maximumDifference(reference,actual),metrics=fluidMetrics(actual,size);
        const passed=metrics.nonFinite===0&&maxAbsoluteError<2e-5;
        checks.push({size,iterations,workgroup,pressureKernel,maxAbsoluteError,passed});
        if(!passed)throw new Error(`Pressure reference failed: ${JSON.stringify(checks.at(-1))}`);
      } finally {solver.dispose();}
    }
  }
  // Advection + projection accumulation, not only a manufactured stationary RHS.
  for(const size of [17,64]) {
    let reference;
    for(const pressureKernel of kernels) {
      const solver=await createFluid(device,{size,iterations:41,workgroup:8,pressureKernel});
      try {
        for(let i=0;i<8;i++)solver.step();const actual=await solver.readState();reference??=actual;
        const maxAbsoluteError=maximumDifference(reference,actual),passed=Number.isFinite(maxAbsoluteError)&&maxAbsoluteError<2e-5;
        checks.push({name:'eight evolving fluid steps',size,iterations:41,pressureKernel,maxAbsoluteError,passed});
        if(!passed)throw new Error('Evolving fluid equivalence failed');
      } finally {solver.dispose();}
    }
  }
  return checks;
}

export async function runPressureSuite(device,{quick=false,heavy=false,candidates=false,packed=false,includeTiled=false,onResult=()=>{}}={}) {
  const results=[],sizes=quick?[64]:heavy?[256,512]:[128,256],workgroups=quick?[16]:[8,16],rounds=quick?1:3,batches=quick?2:4,frames=quick?2:3,iterations=heavy?80:40;
  for(let round=0;round<rounds;round++) for(const size of sizes) for(const workgroup of workgroups) {
    const states=new Map(),pair=[];
    const kernels=packed?['direct','packed4']:candidates?['direct','specialized','temporal-4','temporal-8']:includeTiled?['jacobi','direct','tiled-pair']:['jacobi','direct'];
    for(const pressureKernel of shuffled(kernels,991+round*17+size+workgroup)) {
      const start=performance.now(),solver=await createFluid(device,{size,iterations,workgroup,pressureKernel}),setupMs=performance.now()-start;
      try {
        for(let i=0;i<3;i++)solver.step();await device.queue.onSubmittedWorkDone();solver.reset();
        const drained=[],submission=[],gpu=[];
        for(let b=0;b<batches;b++) {
          const t=performance.now();for(let i=0;i<frames;i++)solver.step();submission.push((performance.now()-t)/frames);
          await device.queue.onSubmittedWorkDone();drained.push((performance.now()-t)/frames);gpu.push(await solver.timing());
        }
        const actual=await solver.readState(),metrics=fluidMetrics(actual,size);states.set(pressureKernel,actual);
        const record={round,...solver.metadata,setupMs,steps:solver.steps,drainedMs:summarize(drained),submissionMs:summarize(submission),samples:{drained,submission,gpu},correctness:{passed:metrics.nonFinite===0,actual:metrics}};
        if(!record.correctness.passed)throw new Error('Nonfinite pressure benchmark state');
        pair.push(record);results.push(record);
      } finally {solver.dispose();}
    }
    for(const record of pair) {const maxAbsoluteDifference=maximumDifference(states.get(candidates||packed?'direct':'jacobi'),states.get(record.pressureKernel));record.correctness.maxAbsoluteDifference=maxAbsoluteDifference;record.correctness.passed&&=Number.isFinite(maxAbsoluteDifference)&&maxAbsoluteDifference<2e-5;await onResult(record);}
    if(!pair.every(x=>x.correctness.passed))throw new Error('Pressure benchmark equivalence failed');
  }
  return {results,protocol:{sizes,workgroups,rounds,batches,frames,iterations,warmupSteps:3,seed:991,includeTiled,candidates,packed,note:'Equal Jacobi iteration count and matching evolved fields. Specialized constants, vectorization and temporal blocking preserve the stencil; tiled kernels compute redundant halos. CPU, GPU and drained timings are distinct.'}};
}
