import {createBaseline,baselineOptions} from '../baselines/vortex-008.js';
import {createVortex} from './webgpu.js';
import {metrics,initialVortex,difference} from './model.js';
import {validateVortex,tolerance} from './suite.js';
import {summarize,shuffled} from '../grid/model.js';

export async function runRebasedSuite(device,{screen=false,kernels=['fft-real8-project','fft-real8-unrolled'],onResult=()=>{},onValidation=()=>{}}={}) {
  const validation=await validateVortex(device,{kernels});await onValidation(validation);
  const protocol={series:8,baseline:'frozen-008',metric:'median GPU simulation + volume rendering',sizes:screen?[128]:[64,128],rounds:screen?1:3,batches:4,frames:2,warmupSteps:2,tolerance,seed:1927,settings:baselineOptions,
    targetSpeedup:10,note:'Baseline is the frozen browser-validated optimized real FFT, not Jacobi. Same cells, timestep, finite-iteration operator and rays. Background completion and JavaScript startup are separate metrics.'};
  const variants=['frozen-008',...kernels],create=(variant,size)=>variant==='frozen-008'?createBaseline(device,{size}):createVortex(device,{...baselineOptions,size,pressureKernel:variant});
  const results=[];
  for(let round=0;round<protocol.rounds;round++)for(const size of protocol.sizes) {
    const fields=new Map(),pixels=new Map(),records=[],initial=metrics(initialVortex(size),size);
    for(const variant of shuffled(variants,protocol.seed+round*19+size)) {
      const start=performance.now(),solver=await create(variant,size),setupMs=performance.now()-start;
      try {
        for(let i=0;i<protocol.warmupSteps;i++)solver.step();await device.queue.onSubmittedWorkDone();solver.reset();
        const drained=[],submission=[],gpu=[];
        for(let b=0;b<protocol.batches;b++) {
          const t=performance.now();for(let i=0;i<protocol.frames;i++)solver.step();submission.push((performance.now()-t)/protocol.frames);
          await device.queue.onSubmittedWorkDone();drained.push((performance.now()-t)/protocol.frames);gpu.push(await solver.timing());
        }
        const field=await solver.readState(),actual=metrics(field,size),advected=metrics(await solver.readAdvected(),size),image=await solver.readPixels();
        fields.set(variant,field);pixels.set(variant,image);
        let litPixels=0;for(let i=0;i<image.length;i+=4)if(image[i]+image[i+1]+image[i+2]>25)litPixels++;
        const passed=actual.nonFinite===0&&actual.energy>0&&actual.energy<=initial.energy*1.01&&actual.dyeMin>=-1e-6&&actual.dyeMax<=1+1e-6&&actual.divergenceRms<=advected.divergenceRms+1e-5&&litPixels>baselineOptions.resolution**2*.05;
        records.push({round,variant,...solver.metadata,setupMs,steps:solver.steps,drainedMs:summarize(drained),submissionMs:summarize(submission),samples:{drained,submission,gpu},correctness:{passed,actual,advected,initial,litPixels}});
      }finally{solver.dispose();}
    }
    for(const record of records) {
      const equivalence=difference(fields.get(record.variant),fields.get('frozen-008')),pixelDifference=difference(pixels.get(record.variant),pixels.get('frozen-008'));
      Object.assign(record.correctness,{equivalence,pixelMaxAbsolute:pixelDifference.maxAbsolute});
      record.correctness.passed&&=equivalence.maxAbsolute<tolerance.maxAbsolute&&equivalence.relativeL2<tolerance.relativeL2&&pixelDifference.maxAbsolute<=tolerance.pixelMaxAbsolute;
      results.push(record);await onResult(record);
    }
    if(records.some(r=>!r.correctness.passed))throw new Error('Rebased field/image equivalence failed');
  }
  // Compare evolving states over a longer horizon, not just aggregate energy.
  const steps=screen?20:100,stability=[],reference=new Map();
  for(const variant of variants) {
    const solver=await create(variant,64),history=[];
    try {
      for(let step=1;step<=steps;step++) {
        solver.step();
        if(step%20===0) {
          const field=await solver.readState();if(variant==='frozen-008')reference.set(step,field);
          const error=difference(field,reference.get(step)),actual=metrics(field,64);
          const passed=actual.nonFinite===0&&actual.energy>0&&actual.energy<=.125*1.01&&actual.dyeMin>=-1e-6&&actual.dyeMax<=1+1e-6&&error.maxAbsolute<tolerance.maxAbsolute&&error.relativeL2<tolerance.relativeL2;
          history.push({step,...error,actual,passed});if(!passed)throw new Error(`Long-run baseline equivalence failed: ${variant} step ${step}`);
        }
      }
      stability.push({variant,size:64,steps,physicalTime:steps*baselineOptions.dt,history,passed:history.every(x=>x.passed)});
    }finally{solver.dispose();}
  }
  return {validation,results,protocol,stability};
}
