import {createVortex} from './webgpu.js';
import {initialVortex,metrics,cpuAdvect,cpuProjection,difference} from './model.js';
import {summarize,shuffled} from '../grid/model.js';

// Fixed before measurement. Units use initial velocity scale U=1.
export const tolerance={maxAbsolute:2e-5,relativeL2:2e-5,pixelMaxAbsolute:1};
export async function validateVortex(device,{kernels=['packed4','fft-jacobi']}={}) {
  const checks=[];
  for(const size of [8,16]) for(const iterations of [1,2,3,80]) for(const pressureKernel of kernels) {
    const field=initialVortex(size);let seed=12345;
    for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      field[((z*size+y)*size+x)*4+c]+=(seed/4294967296-.5)*.2+((x+y+z)%2?.1:-.1);
    }
    const dt=iterations===80?.02:0,reference=cpuProjection(cpuAdvect(field,size,dt,1/1600),size,iterations);
    const solver=await createVortex(device,{size,iterations,dt,pressureKernel,resolution:16,raySteps:8});
    try {
      solver.reset(field);solver.step();const actual=await solver.readState(),error=difference(actual,reference);
      const check={size,iterations,dt,pressureKernel,...error,passed:Number.isFinite(error.maxAbsolute)&&error.maxAbsolute<tolerance.maxAbsolute&&error.relativeL2<tolerance.relativeL2};
      checks.push(check);if(!check.passed)throw new Error(`3D CPU reference failed: ${JSON.stringify(check)}`);
    }finally{solver.dispose();}
  }
  const initial=metrics(initialVortex(16),16),check={name:'analytic initial mean kinetic energy',actual:initial.energy,expected:.125,passed:Math.abs(initial.energy-.125)<1e-7};
  checks.push(check);if(!check.passed)throw new Error('Taylor–Green initial condition failed');
  // Two evolving steps hit near-integer backtraces absent from the dt=0 tests.
  // This caught inconsistent floor/fract lowering on the physical Intel GPU.
  let reference=initialVortex(32);
  for(let k=0;k<2;k++)reference=cpuProjection(cpuAdvect(reference,32,.02,1/1600),32,80);
  for(const pressureKernel of kernels) {
    const solver=await createVortex(device,{size:32,pressureKernel,resolution:16,raySteps:8});
    try {
      solver.step();solver.step();const error=difference(await solver.readState(),reference);
      const check={name:'two-step integer-boundary interpolation',size:32,steps:2,pressureKernel,...error,passed:Number.isFinite(error.maxAbsolute)&&error.maxAbsolute<tolerance.maxAbsolute&&error.relativeL2<tolerance.relativeL2};
      checks.push(check);if(!check.passed)throw new Error(`Backtrace reference failed: ${JSON.stringify(check)}`);
    }finally{solver.dispose();}
  }
  return checks;
}

export async function runVortexSuite(device,{quick=false,onResult=()=>{},onPreview=()=>{},kernels=['packed4','fft-jacobi']}={}) {
  const protocol={sizes:quick?[32]:[64,128],rounds:quick?1:3,batches:quick?2:4,frames:2,warmupSteps:2,iterations:80,dt:.02,resolution:256,raySteps:128,tolerance,seed:937,
    note:'Identical evolving field, 80 finite Jacobi iterations and raymarch quality. Timed submit-to-completion batches exclude setup, validation and readback. GPU timestamps sample the final step of each batch. Low-order stress fixture, not validated DNS or foreground presentation latency.'};
  const results=[];
  for(let round=0;round<protocol.rounds;round++)for(const size of protocol.sizes){
    const fields=new Map(),images=new Map(),pair=[],initial=metrics(initialVortex(size),size);
    for(const pressureKernel of shuffled(kernels,protocol.seed+size+round*19)) {
      const start=performance.now(),solver=await createVortex(device,{size,pressureKernel,iterations:protocol.iterations,dt:protocol.dt,resolution:protocol.resolution,raySteps:protocol.raySteps}),setupMs=performance.now()-start;
      try {
        for(let i=0;i<protocol.warmupSteps;i++)solver.step();await device.queue.onSubmittedWorkDone();solver.reset();
        const drained=[],submission=[],gpu=[];
        for(let b=0;b<protocol.batches;b++) {
          const t=performance.now();for(let i=0;i<protocol.frames;i++)solver.step();submission.push((performance.now()-t)/protocol.frames);
          await device.queue.onSubmittedWorkDone();drained.push((performance.now()-t)/protocol.frames);gpu.push(await solver.timing());
        }
        const field=await solver.readState(),actual=metrics(field,size),advected=metrics(await solver.readAdvected(),size),pixels=await solver.readPixels();
        let litPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>25)litPixels++;
        fields.set(pressureKernel,field);images.set(pressureKernel,pixels);
        const passed=actual.nonFinite===0&&actual.energy>0&&actual.energy<=initial.energy*1.01&&actual.dyeMin>=-1e-6&&actual.dyeMax<=1+1e-6&&actual.divergenceRms<=advected.divergenceRms+1e-5&&litPixels>protocol.resolution**2*.05;
        pair.push({round,...solver.metadata,setupMs,steps:solver.steps,drainedMs:summarize(drained),submissionMs:summarize(submission),samples:{drained,submission,gpu},correctness:{passed,initial,actual,advected,litPixels,energyRelativeDrift:(actual.energy-initial.energy)/initial.energy,dyeMassRelativeDrift:(actual.dyeMass-initial.dyeMass)/initial.dyeMass}});
        if(round===0&&size===protocol.sizes.at(-1)&&pressureKernel==='fft-jacobi')await onPreview({width:protocol.resolution,height:protocol.resolution,pixels:Array.from(pixels)});
      }finally{solver.dispose();}
    }
    for(const record of pair) {
      const error=difference(fields.get(record.pressureKernel),fields.get('packed4')),pixelError=difference(images.get(record.pressureKernel),images.get('packed4'));
      Object.assign(record.correctness,{equivalence:error,pixelMaxAbsolute:pixelError.maxAbsolute});
      record.correctness.passed&&=error.maxAbsolute<tolerance.maxAbsolute&&error.relativeL2<tolerance.relativeL2&&pixelError.maxAbsolute<=tolerance.pixelMaxAbsolute;
      results.push(record);await onResult(record);
    }
    if(pair.some(r=>!r.correctness.passed))throw new Error('3D evolved-field, rendering or physical sanity gate failed');
  }
  return {results,protocol};
}

export async function stabilityVortex(device,{steps=100,pressureKernel='fft-jacobi'}={}) {
  const solver=await createVortex(device,{size:64,pressureKernel}),history=[{step:0,...metrics(initialVortex(64),64)}];
  try {
    for(let step=1;step<=steps;step++) {
      solver.step();
      if(step%20===0||step===steps)history.push({step,...metrics(await solver.readState(),64)});
    }
    const passed=history.every(s=>s.nonFinite===0&&s.energy>0&&s.energy<=history[0].energy*1.01&&s.dyeMin>=-1e-6&&s.dyeMax<=1+1e-6);
    return {passed,size:64,steps,physicalTime:steps*.02,history,note:'Short stability run; does not establish grid convergence or accuracy through the standard T=20 transition.'};
  }finally{solver.dispose();}
}
