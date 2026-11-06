// Real-input 3D FFT: pack even/odd x samples into an N/2 complex transform,
// retain only kx=0..N/2, then transform the other two axes without transposes.
// All arithmetic and storage remain f32. No reduced-resolution field.
function shader(N,width,axis,inverse,batch,maxRadix=4,fused=false,swizzle=false,inlineDivergence=false,unroll=false,projectOutput=false) {
  const n=axis===0?N/2:N,realInput=axis===0&&!inverse,realOutput=axis===0&&inverse,filter=axis===2&&!inverse;
  const radices=[];for(let left=n;left>1;){const r=maxRadix===8&&left%8===0?8:left%4===0?4:2;radices.push(r);left/=r;}
  const lanes=n/Math.max(...radices);
  const shared=k=>{
    const raw=axis===0?`(line*${n}u+(${k}))`:`((${k})*${batch}u+line)`;
    if(!swizzle)return raw;
    return axis===0?`(${raw}^((${raw}>>5u)&31u))`:`(${raw}^(((((${k})/${maxRadix}u)&${32/batch-1}u))*${batch}u))`;
  };
  const index=k=>axis===0?`(row*${width}u+(${k}))`:axis===1?`(group.y*${N*width}u+(${k})*${width}u+x)`:`((${k})*${N*width}u+group.y*${width}u+x)`;
  let ns=1;
  const passes=fused?radices.concat(radices):radices;
  const stages=passes.map((radix,s)=>{
    if(fused&&s===radices.length)ns=1;
    const stageInverse=fused?s>=radices.length:inverse;
    const first=s===0,last=s===passes.length-1,src=s%2?'a':'b',dst=s%2?'b':'a';
    const read=k=>first?(realInput?(inlineDivergence?`vec2f(divergenceAt(row*${N}u+2u*(${k})),divergenceAt(row*${N}u+2u*(${k})+1u))`:`vec2f(input[row*${N}u+2u*(${k})],input[row*${N}u+2u*(${k})+1u])`):realOutput?`unpack(${k},row)`:`input[${index(k)}]`):`vec2f(${src}r[${shared(k)}],${src}i[${shared(k)}])`;
    let code=`{ for(var j=lane;j<${n/radix}u;j+=${lanes}u) {\n`;
    for(let r=0;r<radix;r++) {
      code+=`var v${r}=${read(`j+${r*n/radix}u`)};\n`;
      if(r&&ns>1)code+=`var w${r}=twiddles[${r}u*(j%${ns}u)*${N/(ns*radix)}u];${stageInverse?`w${r}.y=-w${r}.y;`:''}v${r}=mul(v${r},w${r});\n`;
    }
    if(radix===8) {
      for(const [name,indices] of [['e',[0,2,4,6]],['b',[1,3,5,7]]]) {
        const [a,b,c,d]=indices.map(i=>`v${i}`);
        code+=`let ${name}a=${a}+${c};let ${name}b=${a}-${c};let ${name}c=${b}+${d};let ${name}d=${b}-${d};let ${name}rot=${stageInverse?`vec2f(-${name}d.y,${name}d.x)`:`vec2f(${name}d.y,-${name}d.x)`};let ${name}0=${name}a+${name}c;let ${name}1=${name}b+${name}rot;let ${name}2=${name}a-${name}c;let ${name}3=${name}b-${name}rot;\n`;
      }
      code+=`let t0=b0;let t1=mul(b1,vec2f(.7071067811865476,${stageInverse?'.7071067811865476':'-.7071067811865476'}));let t2=${stageInverse?'vec2f(-b2.y,b2.x)':'vec2f(b2.y,-b2.x)'};let t3=mul(b3,vec2f(-.7071067811865476,${stageInverse?'.7071067811865476':'-.7071067811865476'}));\n`;
      for(let i=0;i<4;i++)code+=`let o${i}=e${i}+t${i};let o${i+4}=e${i}-t${i};\n`;
    } else if(radix===4)code+=`let e=v0+v2;let f=v0-v2;let g=v1+v3;let h=v1-v3;let rot=${stageInverse?'vec2f(-h.y,h.x)':'vec2f(h.y,-h.x)'};let o0=e+g;let o1=f+rot;let o2=e-g;let o3=f-rot;\n`;
    else code+='let o0=v0+v1;let o1=v0-v1;\n';
    code+=`let base=(j/${ns}u)*${ns*radix}u+j%${ns}u;\n`;
    for(let r=0;r<radix;r++) {
      const k=`base+${r*ns}u`;
      if(last&&realOutput&&projectOutput)code+=`projectedPressure[line*${N}u+2u*(${k})]=o${r}.x/${n}.0;projectedPressure[line*${N}u+2u*(${k})+1u]=o${r}.y/${n}.0;\n`;
      else if(last&&realOutput)code+=`output[row*${N}u+2u*(${k})]=o${r}.x/${n}.0;output[row*${N}u+2u*(${k})+1u]=o${r}.y/${n}.0;\n`;
      else if(last&&!realInput)code+=`output[${index(k)}]=o${r}${stageInverse?`/${n}.0`:filter?`*factors[${index(k)}]`:''};\n`;
      else if(fused&&s===radices.length-1)code+=`let filtered${r}=o${r}*factors[${index(k)}];${dst}r[${shared(k)}]=filtered${r}.x;${dst}i[${shared(k)}]=filtered${r}.y;\n`;
      else code+=`${dst}r[${shared(k)}]=o${r}.x;${dst}i[${shared(k)}]=o${r}.y;\n`;
    }
    code+='}}\n';
    if(unroll){const body=code.slice(code.indexOf('\n')+1,-3);code=Array.from({length:n/radix/lanes},(_,part)=>`{let j=lane+${part*lanes}u;\n${body}}\n`).join('');}
    if(!last||realInput)code+='workgroupBarrier();\n';ns*=radix;return code;
  }).join('');
  const last=radices.length%2?'a':'b';
  const pack=realInput?`
    for(var k=lane;k<${n}u;k+=${lanes}u) {
      let mirror=(${n}u-k)&${n-1}u;
      let a=vec2f(${last}r[${shared('k')}],${last}i[${shared('k')}]);
      let b=vec2f(${last}r[${shared('mirror')}],-${last}i[${shared('mirror')}]);
      let d=mul(a-b,twiddles[k]);
      output[row*${width}u+k]=.5*(a+b+vec2f(d.y,-d.x));
    }
    if(lane==0u) {
      output[row*${width}u]=vec2f(${last}r[${shared('0u')}]+${last}i[${shared('0u')}],0);
      output[row*${width}u+${n}u]=vec2f(${last}r[${shared('0u')}]-${last}i[${shared('0u')}],0);
      for(var k=${n+1}u;k<${width}u;k++){output[row*${width}u+k]=vec2f(0);}
    }`:'';
  return `
@group(0) @binding(0) var<storage,read> input:array<${realInput?(inlineDivergence?'vec4f':'f32'):'vec2f'}>;
@group(0) @binding(1) var<storage,read_write> output:array<${realOutput?(projectOutput?'vec4f':'f32'):'vec2f'}>;
@group(0) @binding(2) var<storage,read> twiddles:array<vec2f>;
${filter?'@group(0) @binding(3) var<storage,read> factors:array<f32>;':projectOutput?'@group(0) @binding(3) var<storage,read> advected:array<vec4f>;':''}
${projectOutput?`var<workgroup> projectedPressure:array<f32,${N*15}>;`:''}
var<workgroup> ar:array<f32,${n*batch}>;var<workgroup> ai:array<f32,${n*batch}>;
var<workgroup> br:array<f32,${n*batch}>;var<workgroup> bi:array<f32,${n*batch}>;
fn mul(a:vec2f,b:vec2f)->vec2f{return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
${realInput&&inlineDivergence?`fn divergenceAt(i:u32)->f32 {
  let x=i&${N-1}u;let y=(i/${N}u)&${N-1}u;let z=i/${N*N}u;
  let xm=select(i-1u,i+${N-1}u,x==0u);let ym=select(i-${N}u,i+${N*(N-1)}u,y==0u);let zm=select(i-${N*N}u,i+${N*N*(N-1)}u,z==0u);
  let v=input[i];return v.x-input[xm].x+v.y-input[ym].y+v.z-input[zm].z;
}`:''}
${realOutput?`fn unpack(k:u32,row:u32)->vec2f {
  let a=input[row*${width}u+k];let v=input[row*${width}u+${N/2}u-k];let b=vec2f(v.x,-v.y);
  let w=twiddles[k];let d=mul(a-b,vec2f(w.x,-w.y));
  return .5*(a+b+vec2f(-d.y,d.x));
}`:''}
@compute @workgroup_size(${axis===0?`${lanes},${batch}`:`${batch},${lanes}`}) fn main(@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u) {
  let lane=local.${axis===0?'x':'y'};let line=local.${axis===0?'y':'x'};
  ${axis===0?(projectOutput?`let row=(((group.y*2u+line/5u)&${N-1}u)*${N}u+((group.x*4u+line%5u)&${N-1}u));`:`let row=group.x*${batch}u+line;`):`let x=group.x*${batch}u+line;`}
  ${stages}${pack}
  ${projectOutput?`workgroupBarrier();
  if(line%5u<4u&&line/5u<2u) {
    for(var k=lane;k<${N}u;k+=${lanes}u) {
      let i=row*${N}u+k;let center=projectedPressure[line*${N}u+k];
      let neighbors=vec3f(projectedPressure[line*${N}u+((k+1u)&${N-1}u)],projectedPressure[(line+1u)*${N}u+k],projectedPressure[(line+5u)*${N}u+k]);
      let v=advected[i];output[i]=vec4f(v.xyz-neighbors+vec3f(center),v.w);
    }
  }`:''}
}`;
}

export async function createRealFFTPressure(device,{size:n,iterations,divergence,pressure,radix=4,fuse=false,swizzle=false,velocity=null,unroll=false,axisBatch=8,xBatch=4,projected=null}) {
  if(!Number.isInteger(n)||n<8||n>128||(n&(n-1)))throw new RangeError('Real FFT volume requires powers of two in [8,128]');
  const width=Math.ceil((n/2+1)/axisBatch)*axisBatch,count=width*n*n,buffers=[];
  const buffer=(size,data)=>{const b=device.createBuffer({size,usage:GPUBufferUsage.STORAGE,mappedAtCreation:!!data});buffers.push(b);if(data){new Float32Array(b.getMappedRange()).set(data);b.unmap();}return b;};
  try {
    const a=buffer(count*8),b=buffer(count*8),tw=new Float32Array(n*2),f=new Float32Array(count),cosine=Float64Array.from({length:n},(_,i)=>Math.cos(2*Math.PI*i/n));
    for(let k=0;k<n;k++){tw[2*k]=Math.cos(-2*Math.PI*k/n);tw[2*k+1]=Math.sin(-2*Math.PI*k/n);}
    for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<=n/2;x++) {
      const mu=(cosine[x]+cosine[y]+cosine[z])/3;f[(z*n+y)*width+x]=mu===1?-iterations/6:(1-Math.pow(mu,iterations))/(6*(mu-1));
    }
    const twiddles=buffer(tw.byteLength,tw),factors=buffer(f.byteLength,f),stages=[];
    const firstInput=velocity??divergence;
    const passes=fuse?[[0,false,firstInput,a],[1,false,a,b],[2,false,b,a],[1,true,a,b],[0,true,b,projected??pressure]]:[[0,false,firstInput,a],[1,false,a,b],[2,false,b,a],[2,true,a,b],[1,true,b,a],[0,true,a,projected??pressure]];
    for(const [axis,inverse,input,output] of passes) {
      const projectOutput=!!projected&&axis===0&&inverse;
      const batch=projectOutput?15:axis===0?xBatch:axisBatch,filter=axis===2&&!inverse;
      const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:shader(n,width,axis,inverse,batch,radix,fuse&&axis===2,swizzle,!!velocity,unroll,projectOutput)}),entryPoint:'main'}});
      // A single radix-8 transform has only compile-time twiddles. Auto layout
      // omits the unused table binding for those small strided-axis kernels.
      const resources=[[0,input],[1,output],...(axis===0||n>radix?[[2,twiddles]]:[]),...(filter?[[3,factors]]:projectOutput?[[3,velocity]]:[])];
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:resources.map(([binding,buffer])=>({binding,resource:{buffer}}))});
      stages.push({pipeline,group,x:projectOutput?n/4:axis===0?n*n/batch:width/batch,y:projectOutput?n/2:axis===0?1:n});
    }
    return {metadata:{dimensions:3,radix,fuse,swizzle,unroll,axisBatch,xBatch,inlineDivergence:!!velocity,fusedProjection:!!projected,projectionTile:projected?[4,2]:null,dispatches:stages.length,spectrumWidth:width,realFrequencyCount:n/2+1,bufferBytes:buffers.reduce((s,b)=>s+b.size,0),workgroupStorageBytes:Math.max(n*axisBatch*16,n/2*xBatch*16),method:'real-input radix-4/2 FFT, half spectrum, finite Jacobi operator'},
      encode(pass){for(let i=0;i<stages.length;i++){const s=stages[i];pass.setPipeline(s.pipeline);pass.setBindGroup(0,s.group);pass.dispatchWorkgroups(s.x,s.y);}},
      dispose(){for(const b of buffers)b.destroy();},
    };
  }catch(error){for(const b of buffers)b.destroy();throw error;}
}
