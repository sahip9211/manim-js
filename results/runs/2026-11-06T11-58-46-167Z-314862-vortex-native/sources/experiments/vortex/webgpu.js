import {initialVortex} from './model.js';
import {fluidCode,pressureCode,renderCode} from './shaders.js';
import {createFFTPressure} from '../fluid/fft-pressure.js';

export async function createVortex(device,{size=64,iterations=80,dt=.02,viscosity=1/1600,pressureKernel='packed4',resolution=256,raySteps=128}={}) {
  if(!Number.isInteger(size)||size<8||size>128||(size&(size-1)))throw new RangeError('Power-of-two volume size in [8,128] required');
  if(!Number.isInteger(iterations)||iterations<1||iterations>1024||!['packed4','fft-jacobi'].includes(pressureKernel))throw new RangeError('Invalid pressure configuration');
  if(!Number.isFinite(dt)||dt<0||dt>.05||!Number.isFinite(viscosity)||viscosity<0||6*viscosity*dt/(2*Math.PI/size)**2>1)throw new RangeError('Invalid or unstable diffusion step');
  if(!Number.isInteger(resolution)||resolution<16||resolution>1024||!Number.isInteger(raySteps)||raySteps<8||raySteps>512)throw new RangeError('Invalid raymarch configuration');
  const B=GPUBufferUsage,buffers=[],initial=initialVortex(size),fftMode=pressureKernel==='fft-jacobi';
  let fft,texture,querySet;
  const buffer=(bytes,usage,data)=>{const b=device.createBuffer({size:bytes,usage,mappedAtCreation:!!data});buffers.push(b);if(data){new Float32Array(b.getMappedRange()).set(data);b.unmap();}return b;};
  try {
    const fieldA=buffer(initial.byteLength,B.STORAGE|B.COPY_SRC|B.COPY_DST,initial),fieldB=buffer(initial.byteLength,B.STORAGE|B.COPY_SRC);
    const p=[buffer(size**3*4,B.STORAGE),buffer(size**3*4,B.STORAGE)],div=buffer(size**3*4,B.STORAGE);
    const layout=device.createBindGroupLayout({entries:[0,1,2,3,4].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===0||binding===2?'read-only-storage':'storage'}}))});
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
    const module=device.createShaderModule({code:fluidCode(size,dt,viscosity,!fftMode)}),pipelines={};
    for(const entryPoint of ['advect','divergence','project'])pipelines[entryPoint]=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}});
    const group=(src,dst,index)=>device.createBindGroup({layout,entries:[src,dst,p[index],div,p[1-index]].map((buffer,binding)=>({binding,resource:{buffer}}))});
    const advect=group(fieldA,fieldB,0),project=[group(fieldB,fieldA,0),group(fieldB,fieldA,1)];
    let pressurePipeline,pressureGroups;
    if(fftMode)fft=await createFFTPressure(device,{size,iterations,divergence:div,pressure:p[0],dimensions:3});
    else {
      pressurePipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:pressureCode(size)}),entryPoint:'main'}});
      pressureGroups=[0,1].map(i=>device.createBindGroup({layout:pressurePipeline.getBindGroupLayout(0),entries:[p[i],p[1-i],div].map((buffer,binding)=>({binding,resource:{buffer}}))}));
    }
    const renderModule=device.createShaderModule({code:renderCode(size,resolution,raySteps)});
    const renderPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:renderModule,entryPoint:'vs'},fragment:{module:renderModule,entryPoint:'fs',targets:[{format:'rgba8unorm'}]}});
    const renderGroup=device.createBindGroup({layout:renderPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:fieldA}}]});
    texture=device.createTexture({size:[resolution,resolution],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    const view=texture.createView();
    querySet=device.features.has('timestamp-query')?device.createQuerySet({type:'timestamp',count:4}):null;
    const timestamps=querySet?buffer(32,B.QUERY_RESOLVE|B.COPY_SRC):null,readTimestamps=querySet?buffer(32,B.COPY_DST|B.MAP_READ):null;
    const timestampWrites=index=>querySet?{timestampWrites:{querySet,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1}}:{};
    let steps=0;
    async function read(source) {
      const out=device.createBuffer({size:source.size,usage:B.COPY_DST|B.MAP_READ});
      try {const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(source,0,out,0,source.size);device.queue.submit([encoder.finish()]);await out.mapAsync(GPUMapMode.READ);return new Float32Array(out.getMappedRange().slice(0));}finally{out.destroy();}
    }
    return {
      metadata:{size,cells:size**3,dimensions:3,iterations,pressureKernel,dt,viscosity,reynolds:1/viscosity,resolution,raySteps,maxRaySamplesPerFrame:resolution**2*raySteps,dispatchesPerStep:fftMode?13:iterations+2,gpuBufferBytes:buffers.reduce((s,b)=>s+b.size,0)+(fft?.metadata.bufferBytes??0),gpuTextureBytes:resolution**2*4,fft:fft?.metadata??null,boundary:'triply periodic',solver:'trilinear semi-Lagrangian advection, explicit viscosity, backward divergence/forward pressure gradient',render:'oblique front-to-back volume raymarch, nearest-cell density, no early ray termination',timestamps:!!querySet},
      reset(data=initial){if(!(data instanceof Float32Array)||data.length!==initial.length)throw new Error('Invalid field');device.queue.writeBuffer(fieldA,0,data);steps=0;},
      step(){
        const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass(timestampWrites(0));
        const dispatch=(pipeline,group)=>{pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(size/4,size/4,size/4);};
        dispatch(pipelines.advect,advect);dispatch(pipelines.divergence,project[0]);
        let index=1;
        if(fft){fft.encode(pass);index=0;}
        else{pass.setPipeline(pressurePipeline);for(let k=1;k<iterations;k++){pass.setBindGroup(0,pressureGroups[index]);pass.dispatchWorkgroups(Math.ceil(size**3/256));index=1-index;}}
        dispatch(pipelines.project,project[index]);pass.end();
        const render=encoder.beginRenderPass({...timestampWrites(2),colorAttachments:[{view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});
        render.setPipeline(renderPipeline);render.setBindGroup(0,renderGroup);render.draw(3);render.end();
        if(querySet)encoder.resolveQuerySet(querySet,0,4,timestamps,0);
        device.queue.submit([encoder.finish()]);steps++;
      },
      get steps(){return steps;},
      readState:()=>read(fieldA),readAdvected:()=>read(fieldB),
      async timing(){
        if(!querySet)return null;
        const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(timestamps,0,readTimestamps,0,32);device.queue.submit([encoder.finish()]);await readTimestamps.mapAsync(GPUMapMode.READ);
        const t=new BigUint64Array(readTimestamps.getMappedRange()).slice();readTimestamps.unmap();
        return {computeMs:Number(t[1]-t[0])/1e6,renderMs:Number(t[3]-t[2])/1e6,scope:'last step of batch; readback excluded'};
      },
      async readPixels(){
        const bytesPerRow=Math.ceil(resolution*4/256)*256,out=device.createBuffer({size:bytesPerRow*resolution,usage:B.COPY_DST|B.MAP_READ});
        try {const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture},{buffer:out,bytesPerRow},[resolution,resolution]);device.queue.submit([encoder.finish()]);await out.mapAsync(GPUMapMode.READ);
          const raw=new Uint8Array(out.getMappedRange()),pixels=new Uint8Array(resolution**2*4);for(let y=0;y<resolution;y++)pixels.set(raw.subarray(y*bytesPerRow,y*bytesPerRow+resolution*4),y*resolution*4);return pixels;
        }finally{out.destroy();}
      },
      dispose(){fft?.dispose();for(const b of buffers)b.destroy();texture.destroy();querySet?.destroy();},
    };
  }catch(error){fft?.dispose();for(const b of buffers)b.destroy();texture?.destroy();querySet?.destroy();throw error;}
}
