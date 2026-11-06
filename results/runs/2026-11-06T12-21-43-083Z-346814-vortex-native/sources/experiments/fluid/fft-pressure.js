// The periodic Jacobi operator is diagonal in Fourier space. For zero initial
// pressure, p_K = F^-1[ F(div) * (1-mu^K)/(4*(mu-1)) ],
// mu=(cos(2*pi*kx/n)+cos(2*pi*ky/n))/2. This preserves the finite iteration
// count, rather than substituting an infinitely converged Poisson solution.
export function jacobiSpectrum(size, iterations, dimensions=2) {
  const values = new Float32Array(size**dimensions);
  const c = Float64Array.from({length:size}, (_,i)=>Math.cos(2*Math.PI*i/size));
  for(let z=0;z<(dimensions===3?size:1);z++) for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const mu=(c[x]+c[y]+(dimensions===3?c[z]:0))/dimensions;
    values[(z*size+y)*size+x]=mu===1 ? -iterations/(2*dimensions) : (1-Math.pow(mu,iterations))/(2*dimensions*(mu-1));
  }
  return values;
}

function fftCode(n, kind, dimensions) {
  const bits=Math.log2(n), lanes=Math.min(n/2,256);
  const inverse=kind.startsWith('inverse'), realInput=kind==='forwardReal', realOutput=kind==='inverseReal', filter=kind==='forwardFilter';
  return `
@group(0) @binding(0) var<storage, read> input: array<${realInput?'f32':'vec2f'}>;
@group(0) @binding(1) var<storage, read_write> output: array<${realOutput?'f32':'vec2f'}>;
@group(0) @binding(2) var<storage, read> twiddles: array<vec2f>;
${filter?'@group(0) @binding(3) var<storage, read> factors: array<f32>;':''}
var<workgroup> data: array<vec2f, ${n}>;
fn multiply(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x); }
@compute @workgroup_size(${lanes}) fn main(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u) {
  let row=group.x+group.y*${n}u;
  for(var i=lane;i<${n}u;i+=${lanes}u) {
    let reversed=reverseBits(i)>>${32-bits}u;
    data[reversed]=${realInput?'vec2f(input[row*'+n+'u+i],0.0)':'input[row*'+n+'u+i]'};
  }
  workgroupBarrier();
  ${Array.from({length:bits},(_,s)=>{
    const half=2**s, span=2*half;
    return `{
      for(var pair=lane;pair<${n/2}u;pair+=${lanes}u) {
        let offset=pair%${half}u;
        let a=(pair/${half}u)*${span}u+offset; let b=a+${half}u;
        var w=twiddles[offset*${n/span}u]; ${inverse?'w.y=-w.y;':''}
        let u=data[a]; let v=multiply(data[b],w);
        data[a]=u+v; data[b]=u-v;
      }
      workgroupBarrier();
    }`;
  }).join('\n')}
  for(var i=lane;i<${n}u;i+=${lanes}u) {
    output[row*${n}u+i]=${realOutput?`data[i].x/${n}.0`:`data[i]${inverse?`/${n}.0`:filter?`*factors[row*${n}u+i]`:''}`};
  }
}`;
}

function transposeCode(n, outer=false) {
  return `
@group(0) @binding(0) var<storage,read> input: array<vec2f>;
@group(0) @binding(1) var<storage,read_write> output: array<vec2f>;
var<workgroup> tile: array<vec2f,1056>;
@compute @workgroup_size(32,8) fn main(@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u) {
  let x=group.x*32u+local.x;
  let base=group.z*${outer?n:n*n}u;
  for(var offset=0u;offset<32u;offset+=8u) {
    let y=group.y*32u+local.y+offset;
    if(x<${n}u && y<${n}u) { tile[(local.y+offset)*33u+local.x]=input[base+y*${outer?n*n:n}u+x]; }
  }
  workgroupBarrier();
  let tx=group.y*32u+local.x;
  for(var offset=0u;offset<32u;offset+=8u) {
    let ty=group.x*32u+local.y+offset;
    if(tx<${n}u && ty<${n}u) { output[base+ty*${outer?n*n:n}u+tx]=tile[local.x*33u+local.y+offset]; }
  }
}`;
}

export async function createFFTPressure(device,{size,iterations,divergence,pressure,dimensions=2}) {
  if(![2,3].includes(dimensions)) throw new RangeError('Expected 2 or 3 dimensions');
  if (!Number.isInteger(size) || size<8 || size>1024 || (size & (size-1))) throw new RangeError('FFT pressure requires a power-of-two grid in [8,1024]');
  const buffers=[];
  const buffer=(bytes,data)=>{
    const b=device.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE,mappedAtCreation:!!data});buffers.push(b);
    if(data) { new Float32Array(b.getMappedRange()).set(data);b.unmap(); } return b;
  };
  try {
    const a=buffer(size**dimensions*8),b=buffer(size**dimensions*8);
    const twiddleData=new Float32Array(size);
    for(let i=0;i<size/2;i++) {twiddleData[2*i]=Math.cos(-2*Math.PI*i/size);twiddleData[2*i+1]=Math.sin(-2*Math.PI*i/size);}
    const twiddles=buffer(twiddleData.byteLength,twiddleData),factorData=jacobiSpectrum(size,iterations,dimensions),factors=buffer(factorData.byteLength,factorData);
    const pipelines={};
    for(const kind of ['forwardReal','forwardComplex','forwardFilter','inverseComplex','inverseReal','transpose',...(dimensions===3?['transposeOuter']:[])]) {
      const module=device.createShaderModule({code:kind.startsWith('transpose')?transposeCode(size,kind==='transposeOuter'):fftCode(size,kind,dimensions)});
      pipelines[kind]=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
    }
    const stage=(kind,input,output)=>{
      const pipeline=pipelines[kind];
      const resources=[input,output,...(kind.startsWith('transpose')?[]:[twiddles]),...(kind==='forwardFilter'?[factors]:[])];
      return {pipeline,group:device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:resources.map((buffer,binding)=>({binding,resource:{buffer}}))}),dispatch:kind.startsWith('transpose')?[Math.ceil(size/32),Math.ceil(size/32),dimensions===3?size:1]:[size,dimensions===3?size:1]};
    };
    const stages=[stage('forwardReal',divergence,a),stage('transpose',a,b),...(dimensions===3?[stage('forwardComplex',b,a),stage('transposeOuter',a,b)]:[]),stage('forwardFilter',b,a),stage('inverseComplex',a,b),...(dimensions===3?[stage('transposeOuter',b,a),stage('inverseComplex',a,b)]:[]),stage('transpose',b,a),stage('inverseReal',a,pressure)];
    return {metadata:{dimensions,dispatches:stages.length,bufferBytes:buffers.reduce((s,b)=>s+b.size,0),workgroupStorageBytes:Math.max(size*8,1056*8),method:'finite-iteration periodic Jacobi via FFT; f32 rounding differs'},
      encode(pass) {for(const s of stages) {pass.setPipeline(s.pipeline);pass.setBindGroup(0,s.group);pass.dispatchWorkgroups(...s.dispatch);}},
      dispose() {for(const b of buffers)b.destroy();},
    };
  } catch(error) {for(const b of buffers)b.destroy();throw error;}
}
