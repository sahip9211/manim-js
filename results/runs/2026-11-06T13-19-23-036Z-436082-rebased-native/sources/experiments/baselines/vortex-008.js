// FROZEN experiment 008 baseline. Derived from the validated experiment 007 source snapshot.
// Do not edit: scripts/bench-rebased.mjs verifies its SHA-256 digest.

// results/runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/sources/experiments/vortex/model.js
function initialVortex(n) {
  const out = new Float32Array(n ** 3 * 4), h = 2 * Math.PI / n;
  const sine = new Float64Array(n), cosine = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    const angle = (x + 0.5) * h;
    sine[x] = Math.sin(angle);
    cosine[x] = Math.cos(angle);
  }
  let i = 0;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) {
    const sy = sine[y], cy = cosine[y], sz = sine[z], cz = cosine[z];
    for (let x = 0; x < n; x++, i += 4) {
      out[i] = sine[x] * cy * cz;
      out[i + 1] = -cosine[x] * sy * cz;
      out[i + 3] = 0.5 + 0.5 * sine[x] * sy * sz;
    }
  }
  return out;
}

// results/runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/sources/experiments/vortex/shaders.js
function fluidCode(n, dt, viscosity, fused, workgroup = [4, 4, 4]) {
  const h = 2 * Math.PI / n;
  return `
@group(0) @binding(0) var<storage,read> src:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(2) var<storage,read> p:array<f32>;
@group(0) @binding(3) var<storage,read_write> div:array<f32>;
@group(0) @binding(4) var<storage,read_write> q:array<f32>;
fn at(v:vec3i)->u32 { let a=vec3u(v)&vec3u(${n - 1}u);return (a.z*${n}u+a.y)*${n}u+a.x; }
fn sampleField(v:vec3f)->vec4f {
  // Derive weights from the exact integer cell used for lookup. A separately
  // lowered fract() can disagree at integer boundaries after contraction.
  let b=vec3i(floor(v));let f=clamp(v-vec3f(b),vec3f(0),vec3f(1));
  return mix(mix(mix(src[at(b)],src[at(b+vec3i(1,0,0))],f.x),mix(src[at(b+vec3i(0,1,0))],src[at(b+vec3i(1,1,0))],f.x),f.y),
    mix(mix(src[at(b+vec3i(0,0,1))],src[at(b+vec3i(1,0,1))],f.x),mix(src[at(b+vec3i(0,1,1))],src[at(b+vec3i(1,1,1))],f.x),f.y),f.z);
}
@compute @workgroup_size(${workgroup.join(",")}) fn advect(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);let value=src[i];
  let lap=src[at(v+vec3i(1,0,0))].xyz+src[at(v-vec3i(1,0,0))].xyz+src[at(v+vec3i(0,1,0))].xyz+src[at(v-vec3i(0,1,0))].xyz+src[at(v+vec3i(0,0,1))].xyz+src[at(v-vec3i(0,0,1))].xyz-6.0*value.xyz;
  let advected=sampleField(vec3f(id)-${dt / h}*value.xyz);
  dst[i]=vec4f(advected.xyz+${viscosity * dt / (h * h)}*lap,advected.w);
}
@compute @workgroup_size(${workgroup.join(",")}) fn divergence(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);
  let d=src[i].x-src[at(v-vec3i(1,0,0))].x+src[i].y-src[at(v-vec3i(0,1,0))].y+src[i].z-src[at(v-vec3i(0,0,1))].z;
  div[i]=d;${fused ? "q[i]=-d/6.0;" : ""}
}
@compute @workgroup_size(${workgroup.join(",")}) fn project(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);
  dst[i]=vec4f(src[i].xyz-vec3f(p[at(v+vec3i(1,0,0))],p[at(v+vec3i(0,1,0))],p[at(v+vec3i(0,0,1))])+vec3f(p[i]),src[i].w);
}`;
}
function pressureCode(n) {
  return `
@group(0) @binding(0) var<storage,read> p:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> q:array<vec4f>;
@group(0) @binding(2) var<storage,read> div:array<vec4f>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) {
  if(id.x>=${n ** 3 / 4}u) {return;}
  let i=id.x;let x=i&${n / 4 - 1}u;let y=(i/${n / 4}u)&${n - 1}u;let z=i/${n * n / 4}u;
  let l=p[select(i-1u,i+${n / 4 - 1}u,x==0u)];let r=p[select(i+1u,i-${n / 4 - 1}u,x==${n / 4 - 1}u)];let c=p[i];
  let ym=select(i-${n / 4}u,i+${n * (n - 1) / 4}u,y==0u);let yp=select(i+${n / 4}u,i-${n * (n - 1) / 4}u,y==${n - 1}u);
  let zm=select(i-${n * n / 4}u,i+${n * n * (n - 1) / 4}u,z==0u);let zp=select(i+${n * n / 4}u,i-${n * n * (n - 1) / 4}u,z==${n - 1}u);
  q[i]=(vec4f(l.w,c.xyz)+vec4f(c.yzw,r.x)+p[ym]+p[yp]+p[zm]+p[zp]-div[i])/6.0;
}`;
}
function renderCode(n, resolution, raySteps) {
  return `
@group(0) @binding(0) var<storage,read> field:array<vec4f>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
  let points=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(points[i],0,1);
}
@fragment fn fs(@builtin(position) pixel:vec4f)->@location(0) vec4f {
  let uv=(pixel.xy/${resolution}.0-.5)*1.4;var color=vec3f(0);var transmission=1.0;
  for(var k=0u;k<${raySteps}u;k++) {
    let z=(f32(k)+.5)/${raySteps}.0*1.4-.7;
    let pos=vec3f(.8525245*uv.x+.5226872*z,uv.y,-.5226872*uv.x+.8525245*z)+.5;
    if(all(pos>=vec3f(0)) && all(pos<vec3f(1))) {
      let cell=vec3u(pos*${n}.0);let v=field[(cell.z*${n}u+cell.y)*${n}u+cell.x];
      let density=length(v.xyz)*(.2+.8*v.w);let alpha=1.0-exp(-density*${5.6 / raySteps});
      color+=transmission*alpha*(vec3f(.1,.25,.5)+.7*abs(v.xyz));transmission*=1.0-alpha;
    }
  }
  return vec4f(color+transmission*vec3f(.015,.02,.04),1);
}`;
}
function tiledAdvectionCode(n, dt, viscosity) {
  const h = 2 * Math.PI / n;
  return `
var<workgroup> velocityTile:array<vec4f,600>;
fn interpolateTile(b:vec3i,f:vec3f)->vec4f {
  let k=u32((b.z*10+b.y)*10+b.x);
  return mix(mix(mix(velocityTile[k],velocityTile[k+1u],f.x),mix(velocityTile[k+10u],velocityTile[k+11u],f.x),f.y),
    mix(mix(velocityTile[k+100u],velocityTile[k+101u],f.x),mix(velocityTile[k+110u],velocityTile[k+111u],f.x),f.y),f.z);
}
@compute @workgroup_size(8,8,4) fn advectTile(@builtin(local_invocation_id) local:vec3u,@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u,@builtin(global_invocation_id) id:vec3u) {
  let origin=vec3i(group*vec3u(8,8,4));
  for(var t=lane;t<600u;t+=256u) {
    let offset=vec3i(i32(t%10u),i32((t/10u)%10u),i32(t/100u))-vec3i(1);
    velocityTile[t]=src[at(origin+offset)];
  }
  workgroupBarrier();
  let k=((local.z+1u)*10u+local.y+1u)*10u+local.x+1u;
  let value=velocityTile[k];
  let lap=velocityTile[k+1u].xyz+velocityTile[k-1u].xyz+velocityTile[k+10u].xyz+velocityTile[k-10u].xyz+velocityTile[k+100u].xyz+velocityTile[k-100u].xyz-6.0*value.xyz;
  // Keep the same global-coordinate rounding as the untiled implementation.
  let back=vec3f(id)-${dt / h}*value.xyz;
  let b=vec3i(floor(back));let f=clamp(back-vec3f(b),vec3f(0),vec3f(1));let relative=b-origin+vec3i(1);
  var advected:vec4f;
  if(all(relative>=vec3i(0))&&all(relative<vec3i(9,9,5))) {advected=interpolateTile(relative,f);}
  else {advected=sampleField(back);}
  dst[at(vec3i(id))]=vec4f(advected.xyz+${viscosity * dt / (h * h)}*lap,advected.w);
}`;
}

// results/runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/sources/experiments/fluid/fft-pressure.js
function jacobiSpectrum(size, iterations, dimensions = 2) {
  const values = new Float32Array(size ** dimensions);
  const c = Float64Array.from({ length: size }, (_, i) => Math.cos(2 * Math.PI * i / size));
  for (let z = 0; z < (dimensions === 3 ? size : 1); z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const mu = (c[x] + c[y] + (dimensions === 3 ? c[z] : 0)) / dimensions;
    values[(z * size + y) * size + x] = mu === 1 ? -iterations / (2 * dimensions) : (1 - Math.pow(mu, iterations)) / (2 * dimensions * (mu - 1));
  }
  return values;
}
function fftCode(n, kind, dimensions) {
  const bits = Math.log2(n), lanes = Math.min(n / 2, 256);
  const inverse = kind.startsWith("inverse"), realInput = kind === "forwardReal", realOutput = kind === "inverseReal", filter = kind === "forwardFilter";
  return `
@group(0) @binding(0) var<storage, read> input: array<${realInput ? "f32" : "vec2f"}>;
@group(0) @binding(1) var<storage, read_write> output: array<${realOutput ? "f32" : "vec2f"}>;
@group(0) @binding(2) var<storage, read> twiddles: array<vec2f>;
${filter ? "@group(0) @binding(3) var<storage, read> factors: array<f32>;" : ""}
var<workgroup> data: array<vec2f, ${n}>;
fn multiply(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x); }
@compute @workgroup_size(${lanes}) fn main(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u) {
  let row=group.x+group.y*${n}u;
  for(var i=lane;i<${n}u;i+=${lanes}u) {
    let reversed=reverseBits(i)>>${32 - bits}u;
    data[reversed]=${realInput ? "vec2f(input[row*" + n + "u+i],0.0)" : "input[row*" + n + "u+i]"};
  }
  workgroupBarrier();
  ${Array.from({ length: bits }, (_, s) => {
    const half = 2 ** s, span = 2 * half;
    return `{
      for(var pair=lane;pair<${n / 2}u;pair+=${lanes}u) {
        let offset=pair%${half}u;
        let a=(pair/${half}u)*${span}u+offset; let b=a+${half}u;
        var w=twiddles[offset*${n / span}u]; ${inverse ? "w.y=-w.y;" : ""}
        let u=data[a]; let v=multiply(data[b],w);
        data[a]=u+v; data[b]=u-v;
      }
      workgroupBarrier();
    }`;
  }).join("\n")}
  for(var i=lane;i<${n}u;i+=${lanes}u) {
    output[row*${n}u+i]=${realOutput ? `data[i].x/${n}.0` : `data[i]${inverse ? `/${n}.0` : filter ? `*factors[row*${n}u+i]` : ""}`};
  }
}`;
}
function transposeCode(n, outer = false) {
  return `
@group(0) @binding(0) var<storage,read> input: array<vec2f>;
@group(0) @binding(1) var<storage,read_write> output: array<vec2f>;
var<workgroup> tile: array<vec2f,1056>;
@compute @workgroup_size(32,8) fn main(@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u) {
  let x=group.x*32u+local.x;
  let base=group.z*${outer ? n : n * n}u;
  for(var offset=0u;offset<32u;offset+=8u) {
    let y=group.y*32u+local.y+offset;
    if(x<${n}u && y<${n}u) { tile[(local.y+offset)*33u+local.x]=input[base+y*${outer ? n * n : n}u+x]; }
  }
  workgroupBarrier();
  let tx=group.y*32u+local.x;
  for(var offset=0u;offset<32u;offset+=8u) {
    let ty=group.x*32u+local.y+offset;
    if(tx<${n}u && ty<${n}u) { output[base+ty*${outer ? n * n : n}u+tx]=tile[local.x*33u+local.y+offset]; }
  }
}`;
}
async function createFFTPressure(device, { size, iterations, divergence, pressure, dimensions = 2 }) {
  if (![2, 3].includes(dimensions)) throw new RangeError("Expected 2 or 3 dimensions");
  if (!Number.isInteger(size) || size < 8 || size > 1024 || size & size - 1) throw new RangeError("FFT pressure requires a power-of-two grid in [8,1024]");
  const buffers = [];
  const buffer = (bytes, data) => {
    const b = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE, mappedAtCreation: !!data });
    buffers.push(b);
    if (data) {
      new Float32Array(b.getMappedRange()).set(data);
      b.unmap();
    }
    return b;
  };
  try {
    const a = buffer(size ** dimensions * 8), b = buffer(size ** dimensions * 8);
    const twiddleData = new Float32Array(size);
    for (let i = 0; i < size / 2; i++) {
      twiddleData[2 * i] = Math.cos(-2 * Math.PI * i / size);
      twiddleData[2 * i + 1] = Math.sin(-2 * Math.PI * i / size);
    }
    const twiddles = buffer(twiddleData.byteLength, twiddleData), factorData = jacobiSpectrum(size, iterations, dimensions), factors = buffer(factorData.byteLength, factorData);
    const pipelines = {};
    for (const kind of ["forwardReal", "forwardComplex", "forwardFilter", "inverseComplex", "inverseReal", "transpose", ...dimensions === 3 ? ["transposeOuter"] : []]) {
      const module = device.createShaderModule({ code: kind.startsWith("transpose") ? transposeCode(size, kind === "transposeOuter") : fftCode(size, kind, dimensions) });
      pipelines[kind] = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });
    }
    const stage = (kind, input, output) => {
      const pipeline = pipelines[kind];
      const resources = [input, output, ...kind.startsWith("transpose") ? [] : [twiddles], ...kind === "forwardFilter" ? [factors] : []];
      return { pipeline, group: device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: resources.map((buffer2, binding) => ({ binding, resource: { buffer: buffer2 } })) }), dispatch: kind.startsWith("transpose") ? [Math.ceil(size / 32), Math.ceil(size / 32), dimensions === 3 ? size : 1] : [size, dimensions === 3 ? size : 1] };
    };
    const stages = [stage("forwardReal", divergence, a), stage("transpose", a, b), ...dimensions === 3 ? [stage("forwardComplex", b, a), stage("transposeOuter", a, b)] : [], stage("forwardFilter", b, a), stage("inverseComplex", a, b), ...dimensions === 3 ? [stage("transposeOuter", b, a), stage("inverseComplex", a, b)] : [], stage("transpose", b, a), stage("inverseReal", a, pressure)];
    return {
      metadata: { dimensions, dispatches: stages.length, bufferBytes: buffers.reduce((s, b2) => s + b2.size, 0), workgroupStorageBytes: Math.max(size * 8, 1056 * 8), method: "finite-iteration periodic Jacobi via FFT; f32 rounding differs" },
      encode(pass) {
        for (const s of stages) {
          pass.setPipeline(s.pipeline);
          pass.setBindGroup(0, s.group);
          pass.dispatchWorkgroups(...s.dispatch);
        }
      },
      dispose() {
        for (const b2 of buffers) b2.destroy();
      }
    };
  } catch (error) {
    for (const b of buffers) b.destroy();
    throw error;
  }
}

// results/runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/sources/experiments/fluid/fft-real.js
function shader(N, width, axis, inverse, batch, maxRadix = 4, fused = false, swizzle = false, inlineDivergence = false) {
  const n = axis === 0 ? N / 2 : N, realInput = axis === 0 && !inverse, realOutput = axis === 0 && inverse, filter = axis === 2 && !inverse;
  const radices = [];
  for (let left = n; left > 1; ) {
    const r = maxRadix === 8 && left % 8 === 0 ? 8 : left % 4 === 0 ? 4 : 2;
    radices.push(r);
    left /= r;
  }
  const lanes = n / Math.max(...radices);
  const shared = (k) => {
    const raw = axis === 0 ? `(line*${n}u+(${k}))` : `((${k})*${batch}u+line)`;
    if (!swizzle) return raw;
    return axis === 0 ? `(${raw}^((${raw}>>5u)&31u))` : `(${raw}^(((((${k})/${maxRadix}u)&${32 / batch - 1}u))*${batch}u))`;
  };
  const index = (k) => axis === 0 ? `(row*${width}u+(${k}))` : axis === 1 ? `(group.y*${N * width}u+(${k})*${width}u+x)` : `((${k})*${N * width}u+group.y*${width}u+x)`;
  let ns = 1;
  const passes = fused ? radices.concat(radices) : radices;
  const stages = passes.map((radix, s) => {
    if (fused && s === radices.length) ns = 1;
    const stageInverse = fused ? s >= radices.length : inverse;
    const first = s === 0, last2 = s === passes.length - 1, src = s % 2 ? "a" : "b", dst = s % 2 ? "b" : "a";
    const read = (k) => first ? realInput ? inlineDivergence ? `vec2f(divergenceAt(row*${N}u+2u*(${k})),divergenceAt(row*${N}u+2u*(${k})+1u))` : `vec2f(input[row*${N}u+2u*(${k})],input[row*${N}u+2u*(${k})+1u])` : realOutput ? `unpack(${k},row)` : `input[${index(k)}]` : `vec2f(${src}r[${shared(k)}],${src}i[${shared(k)}])`;
    let code = `{ for(var j=lane;j<${n / radix}u;j+=${lanes}u) {
`;
    for (let r = 0; r < radix; r++) {
      code += `var v${r}=${read(`j+${r * n / radix}u`)};
`;
      if (r && ns > 1) code += `var w${r}=twiddles[${r}u*(j%${ns}u)*${N / (ns * radix)}u];${stageInverse ? `w${r}.y=-w${r}.y;` : ""}v${r}=mul(v${r},w${r});
`;
    }
    if (radix === 8) {
      for (const [name, indices] of [["e", [0, 2, 4, 6]], ["b", [1, 3, 5, 7]]]) {
        const [a, b, c, d] = indices.map((i) => `v${i}`);
        code += `let ${name}a=${a}+${c};let ${name}b=${a}-${c};let ${name}c=${b}+${d};let ${name}d=${b}-${d};let ${name}rot=${stageInverse ? `vec2f(-${name}d.y,${name}d.x)` : `vec2f(${name}d.y,-${name}d.x)`};let ${name}0=${name}a+${name}c;let ${name}1=${name}b+${name}rot;let ${name}2=${name}a-${name}c;let ${name}3=${name}b-${name}rot;
`;
      }
      code += `let t0=b0;let t1=mul(b1,vec2f(.7071067811865476,${stageInverse ? ".7071067811865476" : "-.7071067811865476"}));let t2=${stageInverse ? "vec2f(-b2.y,b2.x)" : "vec2f(b2.y,-b2.x)"};let t3=mul(b3,vec2f(-.7071067811865476,${stageInverse ? ".7071067811865476" : "-.7071067811865476"}));
`;
      for (let i = 0; i < 4; i++) code += `let o${i}=e${i}+t${i};let o${i + 4}=e${i}-t${i};
`;
    } else if (radix === 4) code += `let e=v0+v2;let f=v0-v2;let g=v1+v3;let h=v1-v3;let rot=${stageInverse ? "vec2f(-h.y,h.x)" : "vec2f(h.y,-h.x)"};let o0=e+g;let o1=f+rot;let o2=e-g;let o3=f-rot;
`;
    else code += "let o0=v0+v1;let o1=v0-v1;\n";
    code += `let base=(j/${ns}u)*${ns * radix}u+j%${ns}u;
`;
    for (let r = 0; r < radix; r++) {
      const k = `base+${r * ns}u`;
      if (last2 && realOutput) code += `output[row*${N}u+2u*(${k})]=o${r}.x/${n}.0;output[row*${N}u+2u*(${k})+1u]=o${r}.y/${n}.0;
`;
      else if (last2 && !realInput) code += `output[${index(k)}]=o${r}${stageInverse ? `/${n}.0` : filter ? `*factors[${index(k)}]` : ""};
`;
      else if (fused && s === radices.length - 1) code += `let filtered${r}=o${r}*factors[${index(k)}];${dst}r[${shared(k)}]=filtered${r}.x;${dst}i[${shared(k)}]=filtered${r}.y;
`;
      else code += `${dst}r[${shared(k)}]=o${r}.x;${dst}i[${shared(k)}]=o${r}.y;
`;
    }
    code += "}}\n";
    if (!last2 || realInput) code += "workgroupBarrier();\n";
    ns *= radix;
    return code;
  }).join("");
  const last = radices.length % 2 ? "a" : "b";
  const pack = realInput ? `
    for(var k=lane;k<${n}u;k+=${lanes}u) {
      let mirror=(${n}u-k)&${n - 1}u;
      let a=vec2f(${last}r[${shared("k")}],${last}i[${shared("k")}]);
      let b=vec2f(${last}r[${shared("mirror")}],-${last}i[${shared("mirror")}]);
      let d=mul(a-b,twiddles[k]);
      output[row*${width}u+k]=.5*(a+b+vec2f(d.y,-d.x));
    }
    if(lane==0u) {
      output[row*${width}u]=vec2f(${last}r[${shared("0u")}]+${last}i[${shared("0u")}],0);
      output[row*${width}u+${n}u]=vec2f(${last}r[${shared("0u")}]-${last}i[${shared("0u")}],0);
      for(var k=${n + 1}u;k<${width}u;k++){output[row*${width}u+k]=vec2f(0);}
    }` : "";
  return `
@group(0) @binding(0) var<storage,read> input:array<${realInput ? inlineDivergence ? "vec4f" : "f32" : "vec2f"}>;
@group(0) @binding(1) var<storage,read_write> output:array<${realOutput ? "f32" : "vec2f"}>;
@group(0) @binding(2) var<storage,read> twiddles:array<vec2f>;
${filter ? "@group(0) @binding(3) var<storage,read> factors:array<f32>;" : ""}
var<workgroup> ar:array<f32,${n * batch}>;var<workgroup> ai:array<f32,${n * batch}>;
var<workgroup> br:array<f32,${n * batch}>;var<workgroup> bi:array<f32,${n * batch}>;
fn mul(a:vec2f,b:vec2f)->vec2f{return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
${realInput && inlineDivergence ? `fn divergenceAt(i:u32)->f32 {
  let x=i&${N - 1}u;let y=(i/${N}u)&${N - 1}u;let z=i/${N * N}u;
  let xm=select(i-1u,i+${N - 1}u,x==0u);let ym=select(i-${N}u,i+${N * (N - 1)}u,y==0u);let zm=select(i-${N * N}u,i+${N * N * (N - 1)}u,z==0u);
  let v=input[i];return v.x-input[xm].x+v.y-input[ym].y+v.z-input[zm].z;
}` : ""}
${realOutput ? `fn unpack(k:u32,row:u32)->vec2f {
  let a=input[row*${width}u+k];let v=input[row*${width}u+${N / 2}u-k];let b=vec2f(v.x,-v.y);
  let w=twiddles[k];let d=mul(a-b,vec2f(w.x,-w.y));
  return .5*(a+b+vec2f(-d.y,d.x));
}` : ""}
@compute @workgroup_size(${axis === 0 ? `${lanes},${batch}` : `${batch},${lanes}`}) fn main(@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u) {
  let lane=local.${axis === 0 ? "x" : "y"};let line=local.${axis === 0 ? "y" : "x"};
  ${axis === 0 ? `let row=group.x*${batch}u+line;` : `let x=group.x*${batch}u+line;`}
  ${stages}${pack}
}`;
}
async function createRealFFTPressure(device, { size: n, iterations, divergence, pressure, radix = 4, fuse = false, swizzle = false, velocity = null }) {
  if (!Number.isInteger(n) || n < 8 || n > 128 || n & n - 1) throw new RangeError("Real FFT volume requires powers of two in [8,128]");
  const width = Math.ceil((n / 2 + 1) / 8) * 8, count = width * n * n, buffers = [];
  const buffer = (size, data) => {
    const b = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE, mappedAtCreation: !!data });
    buffers.push(b);
    if (data) {
      new Float32Array(b.getMappedRange()).set(data);
      b.unmap();
    }
    return b;
  };
  try {
    const a = buffer(count * 8), b = buffer(count * 8), tw = new Float32Array(n * 2), f = new Float32Array(count), cosine = Float64Array.from({ length: n }, (_, i) => Math.cos(2 * Math.PI * i / n));
    for (let k = 0; k < n; k++) {
      tw[2 * k] = Math.cos(-2 * Math.PI * k / n);
      tw[2 * k + 1] = Math.sin(-2 * Math.PI * k / n);
    }
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x <= n / 2; x++) {
      const mu = (cosine[x] + cosine[y] + cosine[z]) / 3;
      f[(z * n + y) * width + x] = mu === 1 ? -iterations / 6 : (1 - Math.pow(mu, iterations)) / (6 * (mu - 1));
    }
    const twiddles = buffer(tw.byteLength, tw), factors = buffer(f.byteLength, f), stages = [];
    const firstInput = velocity ?? divergence;
    const passes = fuse ? [[0, false, firstInput, a], [1, false, a, b], [2, false, b, a], [1, true, a, b], [0, true, b, pressure]] : [[0, false, firstInput, a], [1, false, a, b], [2, false, b, a], [2, true, a, b], [1, true, b, a], [0, true, a, pressure]];
    for (const [axis, inverse, input, output] of passes) {
      const batch = axis === 0 ? 4 : 8, filter = axis === 2 && !inverse;
      const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: device.createShaderModule({ code: shader(n, width, axis, inverse, batch, radix, fuse && axis === 2, swizzle, !!velocity) }), entryPoint: "main" } });
      const resources = [[0, input], [1, output], ...axis === 0 || n > radix ? [[2, twiddles]] : [], ...filter ? [[3, factors]] : []];
      const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: resources.map(([binding, buffer2]) => ({ binding, resource: { buffer: buffer2 } })) });
      stages.push({ pipeline, group, x: axis === 0 ? n * n / batch : width / batch, y: axis === 0 ? 1 : n });
    }
    return {
      metadata: { dimensions: 3, radix, fuse, swizzle, inlineDivergence: !!velocity, dispatches: stages.length, spectrumWidth: width, realFrequencyCount: n / 2 + 1, bufferBytes: buffers.reduce((s, b2) => s + b2.size, 0), workgroupStorageBytes: n * 8 * 16, method: "real-input radix-4/2 FFT, half spectrum, finite Jacobi operator" },
      encode(pass) {
        for (let i = 0; i < stages.length; i++) {
          const s = stages[i];
          pass.setPipeline(s.pipeline);
          pass.setBindGroup(0, s.group);
          pass.dispatchWorkgroups(s.x, s.y);
        }
      },
      dispose() {
        for (const b2 of buffers) b2.destroy();
      }
    };
  } catch (error) {
    for (const b of buffers) b.destroy();
    throw error;
  }
}

// results/runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/sources/experiments/fluid/fft-stockham.js
function shader2(n, axis, inverse, realInput, realOutput, filter, batch) {
  const lanes = n / 4, radices = [];
  for (let left = n; left > 1; ) {
    const r = left % 4 === 0 ? 4 : 2;
    radices.push(r);
    left /= r;
  }
  const shared = (k) => axis === 0 ? `(line*${n}u+(${k}))` : `((${k})*${batch}u+line)`;
  const index = (k) => axis === 0 ? `(row*${n}u+(${k}))` : axis === 1 ? `(group.y*${n * n}u+(${k})*${n}u+x)` : `((${k})*${n * n}u+group.y*${n}u+x)`;
  let ns = 1;
  const stages = radices.map((radix, s) => {
    const first = s === 0, last = s === radices.length - 1, src = s % 2 ? "a" : "b", dst = s % 2 ? "b" : "a";
    const read = (k) => first ? realInput ? `vec2f(input[${index(k)}],0.0)` : `input[${index(k)}]` : `vec2f(${src}r[${shared(k)}],${src}i[${shared(k)}])`;
    let code = `{ for(var j=lane;j<${n / radix}u;j+=${lanes}u) {
`;
    for (let r = 0; r < radix; r++) {
      code += `var v${r}=${read(`j+${r * n / radix}u`)};
`;
      if (r && ns > 1) code += `var w${r}=twiddles[${r}u*(j%${ns}u)*${n / (ns * radix)}u];${inverse ? `w${r}.y=-w${r}.y;` : ""}v${r}=mul(v${r},w${r});
`;
    }
    if (radix === 4) code += `let evenSum=v0+v2;let evenDiff=v0-v2;let oddSum=v1+v3;let oddDiff=v1-v3;let rot=${inverse ? "vec2f(-oddDiff.y,oddDiff.x)" : "vec2f(oddDiff.y,-oddDiff.x)"};let o0=evenSum+oddSum;let o1=evenDiff+rot;let o2=evenSum-oddSum;let o3=evenDiff-rot;
`;
    else code += "let o0=v0+v1;let o1=v0-v1;\n";
    code += `let base=(j/${ns}u)*${ns * radix}u+j%${ns}u;
`;
    for (let r = 0; r < radix; r++) {
      const k = `base+${r * ns}u`;
      if (last) code += `output[${index(k)}]=${realOutput ? `o${r}.x/${n}.0` : `o${r}${inverse ? `/${n}.0` : filter ? `*factors[${index(k)}]` : ""}`};
`;
      else code += `${dst}r[${shared(k)}]=o${r}.x;${dst}i[${shared(k)}]=o${r}.y;
`;
    }
    code += "}}\n";
    if (!last) code += "workgroupBarrier();\n";
    ns *= radix;
    return code;
  }).join("");
  return `
@group(0) @binding(0) var<storage,read> input:array<${realInput ? "f32" : "vec2f"}>;
@group(0) @binding(1) var<storage,read_write> output:array<${realOutput ? "f32" : "vec2f"}>;
@group(0) @binding(2) var<storage,read> twiddles:array<vec2f>;
${filter ? "@group(0) @binding(3) var<storage,read> factors:array<f32>;" : ""}
var<workgroup> ar:array<f32,${n * batch}>;var<workgroup> ai:array<f32,${n * batch}>;
var<workgroup> br:array<f32,${n * batch}>;var<workgroup> bi:array<f32,${n * batch}>;
fn mul(a:vec2f,b:vec2f)->vec2f{return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
@compute @workgroup_size(${axis === 0 ? `${lanes},${batch}` : `${batch},${lanes}`}) fn main(@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u) {
  let lane=local.${axis === 0 ? "x" : "y"};let line=local.${axis === 0 ? "y" : "x"};
  ${axis === 0 ? `let row=group.x*${batch}u+line;` : `let x=group.x*${batch}u+line;`}
  ${stages}
}`;
}
async function createStockhamPressure(device, { size: n, iterations, divergence, pressure, staticBuffers = false }) {
  if (!Number.isInteger(n) || n < 8 || n > 128 || n & n - 1) throw new RangeError("Stockham volume requires powers of two in [8,128]");
  const buffers = [], buffer = (size, data) => {
    const b = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE, mappedAtCreation: !!data });
    buffers.push(b);
    if (data) {
      new Float32Array(b.getMappedRange()).set(data);
      b.unmap();
    }
    return b;
  };
  try {
    const a = buffer(n ** 3 * 8), b = buffer(n ** 3 * 8), tw = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      tw[2 * k] = Math.cos(-2 * Math.PI * k / n);
      tw[2 * k + 1] = Math.sin(-2 * Math.PI * k / n);
    }
    const twiddles = buffer(tw.byteLength, tw), f = jacobiSpectrum(n, iterations, 3), factors = buffer(f.byteLength, f), stages = [];
    for (const [axis, inverse, input, output, realInput, realOutput, filter] of [[0, false, divergence, a, true, false, false], [1, false, a, b, false, false, false], [2, false, b, a, false, false, true], [2, true, a, b, false, false, false], [1, true, b, a, false, false, false], [0, true, a, pressure, false, true, false]]) {
      const batch = axis === 0 ? 4 : 8;
      const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: device.createShaderModule({ code: staticBuffers ? shader2(n, axis, inverse, realInput, realOutput, filter, batch).replace(/(input|output):array<(f32|vec2f)>/g, `$1:array<$2,${n ** 3}>`).replace("twiddles:array<vec2f>", `twiddles:array<vec2f,${n}>`).replace("factors:array<f32>", `factors:array<f32,${n ** 3}>`) : shader2(n, axis, inverse, realInput, realOutput, filter, batch) }), entryPoint: "main" } });
      const resources = [input, output, twiddles, ...filter ? [factors] : []];
      const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: resources.map((buffer2, binding) => ({ binding, resource: { buffer: buffer2 } })) });
      stages.push({ pipeline, group, x: axis === 0 ? n * n / batch : n / batch, y: axis === 0 ? 1 : n });
    }
    return {
      metadata: { dimensions: 3, dispatches: 6, bufferBytes: buffers.reduce((s, b2) => s + b2.size, 0), workgroupStorageBytes: n * 8 * 16, method: "radix-4/2 Stockham, batched strided transforms, finite-iteration Jacobi" },
      encode(pass) {
        for (let i = 0; i < stages.length; i++) {
          const s = stages[i];
          pass.setPipeline(s.pipeline);
          pass.setBindGroup(0, s.group);
          pass.dispatchWorkgroups(s.x, s.y);
        }
      },
      dispose() {
        for (const b2 of buffers) b2.destroy();
      }
    };
  } catch (error) {
    for (const b of buffers) b.destroy();
    throw error;
  }
}

// results/runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/sources/experiments/vortex/webgpu.js
async function createVortex(device, { size = 64, iterations = 80, dt = 0.02, viscosity = 1 / 1600, pressureKernel = "packed4", resolution = 256, raySteps = 128, profileStages = false, workgroup = [4, 4, 4] } = {}) {
  if (!Number.isInteger(size) || size < 8 || size > 128 || size & size - 1) throw new RangeError("Power-of-two volume size in [8,128] required");
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1024 || !["packed4", "fft-jacobi", "fft-stockham", "fft-stockham-static", "fft-real", "fft-real8", "fft-real8-fused", "fft-real8-tiled", "fft-real8-swizzle", "fft-real8-inline"].includes(pressureKernel)) throw new RangeError("Invalid pressure configuration");
  if (!Number.isFinite(dt) || dt < 0 || dt > 0.05 || !Number.isFinite(viscosity) || viscosity < 0 || 6 * viscosity * dt / (2 * Math.PI / size) ** 2 > 1) throw new RangeError("Invalid or unstable diffusion step");
  if (!Number.isInteger(resolution) || resolution < 16 || resolution > 1024 || !Number.isInteger(raySteps) || raySteps < 8 || raySteps > 512) throw new RangeError("Invalid raymarch configuration");
  if (!Array.isArray(workgroup) || workgroup.length !== 3 || workgroup.some((x) => !Number.isInteger(x) || x < 1 || size % x) || workgroup.reduce((a, b) => a * b, 1) > 256) throw new RangeError("Invalid workgroup");
  const B = GPUBufferUsage, buffers = [], initial = initialVortex(size), fftMode = pressureKernel.startsWith("fft-"), tiledAdvection = pressureKernel.endsWith("-tiled"), inlineDivergence = pressureKernel.endsWith("-inline");
  let fft, texture, querySet;
  const buffer = (bytes, usage, data) => {
    const b = device.createBuffer({ size: bytes, usage, mappedAtCreation: !!data });
    buffers.push(b);
    if (data) {
      new Float32Array(b.getMappedRange()).set(data);
      b.unmap();
    }
    return b;
  };
  try {
    const fieldA = buffer(initial.byteLength, B.STORAGE | B.COPY_SRC | B.COPY_DST, initial), fieldB = buffer(initial.byteLength, B.STORAGE | B.COPY_SRC);
    const p = Array.from({ length: inlineDivergence ? 1 : 2 }, () => buffer(size ** 3 * 4, B.STORAGE)), div = inlineDivergence ? null : buffer(size ** 3 * 4, B.STORAGE);
    const layout = inlineDivergence ? null : device.createBindGroupLayout({ entries: [0, 1, 2, 3, 4].map((binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: binding === 0 || binding === 2 ? "read-only-storage" : "storage" } })) });
    const pipelineLayout = inlineDivergence ? "auto" : device.createPipelineLayout({ bindGroupLayouts: [layout] });
    let code = fluidCode(size, dt, viscosity, !fftMode, workgroup) + (tiledAdvection ? tiledAdvectionCode(size, dt, viscosity) : "");
    if (pressureKernel.endsWith("-static")) code = code.replaceAll("array<vec4f>", `array<vec4f,${size ** 3}>`).replaceAll("array<f32>", `array<f32,${size ** 3}>`);
    const module = device.createShaderModule({ code }), pipelines = {};
    for (const entryPoint of inlineDivergence ? ["advect", "project"] : ["advect", "divergence", "project"]) pipelines[entryPoint] = await device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint: entryPoint === "advect" && tiledAdvection ? "advectTile" : entryPoint } });
    const group = (src, dst, index) => device.createBindGroup({ layout, entries: [src, dst, p[index], div, p[1 - index]].map((buffer2, binding) => ({ binding, resource: { buffer: buffer2 } })) });
    const minimalGroup = (pipeline, resources) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: resources.map((buffer2, binding) => ({ binding, resource: { buffer: buffer2 } })) });
    const advect = inlineDivergence ? minimalGroup(pipelines.advect, [fieldA, fieldB]) : group(fieldA, fieldB, 0);
    const project = inlineDivergence ? [minimalGroup(pipelines.project, [fieldB, fieldA, p[0]])] : [group(fieldB, fieldA, 0), group(fieldB, fieldA, 1)];
    let pressurePipeline, pressureGroups;
    if (fftMode) fft = await (pressureKernel.startsWith("fft-real") ? createRealFFTPressure : pressureKernel.startsWith("fft-stockham") ? createStockhamPressure : createFFTPressure)(device, { size, iterations, divergence: div, pressure: p[0], dimensions: 3, staticBuffers: pressureKernel.endsWith("-static"), radix: pressureKernel.includes("real8") ? 8 : 4, fuse: pressureKernel.endsWith("fused"), swizzle: pressureKernel.endsWith("swizzle"), velocity: inlineDivergence ? fieldB : null });
    else {
      pressurePipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: device.createShaderModule({ code: pressureCode(size) }), entryPoint: "main" } });
      pressureGroups = [0, 1].map((i) => device.createBindGroup({ layout: pressurePipeline.getBindGroupLayout(0), entries: [p[i], p[1 - i], div].map((buffer2, binding) => ({ binding, resource: { buffer: buffer2 } })) }));
    }
    const renderModule = device.createShaderModule({ code: renderCode(size, resolution, raySteps) });
    const renderPipeline = await device.createRenderPipelineAsync({ layout: "auto", vertex: { module: renderModule, entryPoint: "vs" }, fragment: { module: renderModule, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] } });
    const renderGroup = device.createBindGroup({ layout: renderPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fieldA } }] });
    texture = device.createTexture({ size: [resolution, resolution], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const view = texture.createView();
    const queryCount = profileStages ? 10 : 4;
    querySet = device.features.has("timestamp-query") ? device.createQuerySet({ type: "timestamp", count: queryCount }) : null;
    const timestamps = querySet ? buffer(queryCount * 8, B.QUERY_RESOLVE | B.COPY_SRC) : null, readTimestamps = querySet ? buffer(queryCount * 8, B.COPY_DST | B.MAP_READ) : null;
    const timestampWrites = (index) => querySet ? { timestampWrites: { querySet, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1 } } : {};
    let steps = 0;
    async function read(source) {
      const out = device.createBuffer({ size: source.size, usage: B.COPY_DST | B.MAP_READ });
      try {
        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(source, 0, out, 0, source.size);
        device.queue.submit([encoder.finish()]);
        await out.mapAsync(GPUMapMode.READ);
        return new Float32Array(out.getMappedRange().slice(0));
      } finally {
        out.destroy();
      }
    }
    return {
      metadata: { profileStages, workgroup, tiledAdvection, inlineDivergence, advectionWorkgroup: tiledAdvection ? [8, 8, 4] : workgroup, size, cells: size ** 3, dimensions: 3, iterations, pressureKernel, dt, viscosity, reynolds: 1 / viscosity, resolution, raySteps, maxRaySamplesPerFrame: resolution ** 2 * raySteps, dispatchesPerStep: fftMode ? fft.metadata.dispatches + (inlineDivergence ? 2 : 3) : iterations + 2, gpuBufferBytes: buffers.reduce((s, b) => s + b.size, 0) + (fft?.metadata.bufferBytes ?? 0), gpuTextureBytes: resolution ** 2 * 4, fft: fft?.metadata ?? null, boundary: "triply periodic", solver: "trilinear semi-Lagrangian advection, explicit viscosity, backward divergence/forward pressure gradient", render: "oblique front-to-back volume raymarch, nearest-cell density, no early ray termination", timestamps: !!querySet },
      reset(data = initial) {
        if (!(data instanceof Float32Array) || data.length !== initial.length) throw new Error("Invalid field");
        device.queue.writeBuffer(fieldA, 0, data);
        steps = 0;
      },
      step() {
        const encoder = device.createCommandEncoder();
        let pass = encoder.beginComputePass(timestampWrites(0));
        const dispatch = (pipeline, group2) => {
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, group2);
          pass.dispatchWorkgroups(size / workgroup[0], size / workgroup[1], size / workgroup[2]);
        };
        pass.setPipeline(pipelines.advect);
        pass.setBindGroup(0, advect);
        pass.dispatchWorkgroups(size / (tiledAdvection ? 8 : workgroup[0]), size / (tiledAdvection ? 8 : workgroup[1]), size / (tiledAdvection ? 4 : workgroup[2]));
        if (profileStages) {
          pass.end();
          pass = encoder.beginComputePass(timestampWrites(2));
        }
        if (!inlineDivergence) dispatch(pipelines.divergence, project[0]);
        if (profileStages) {
          pass.end();
          pass = encoder.beginComputePass(timestampWrites(4));
        }
        let index = 1;
        if (fft) {
          fft.encode(pass);
          index = 0;
        } else {
          pass.setPipeline(pressurePipeline);
          for (let k = 1; k < iterations; k++) {
            pass.setBindGroup(0, pressureGroups[index]);
            pass.dispatchWorkgroups(Math.ceil(size ** 3 / 256));
            index = 1 - index;
          }
        }
        if (profileStages) {
          pass.end();
          pass = encoder.beginComputePass(timestampWrites(6));
        }
        dispatch(pipelines.project, project[index]);
        pass.end();
        const render = encoder.beginRenderPass({ ...timestampWrites(queryCount - 2), colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
        render.setPipeline(renderPipeline);
        render.setBindGroup(0, renderGroup);
        render.draw(3);
        render.end();
        if (querySet) encoder.resolveQuerySet(querySet, 0, queryCount, timestamps, 0);
        device.queue.submit([encoder.finish()]);
        steps++;
      },
      get steps() {
        return steps;
      },
      readState: () => read(fieldA),
      readAdvected: () => read(fieldB),
      async timing() {
        if (!querySet) return null;
        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(timestamps, 0, readTimestamps, 0, queryCount * 8);
        device.queue.submit([encoder.finish()]);
        await readTimestamps.mapAsync(GPUMapMode.READ);
        const t = new BigUint64Array(readTimestamps.getMappedRange()).slice();
        readTimestamps.unmap();
        const d = Array.from({ length: queryCount / 2 }, (_, i) => Number(t[2 * i + 1] - t[2 * i]) / 1e6);
        return { computeMs: d.slice(0, -1).reduce((a, b) => a + b, 0), renderMs: d.at(-1), ...profileStages ? { stages: Object.fromEntries(["advection", "divergence", "pressure", "projection"].map((name, i) => [name, d[i]])) } : {}, scope: profileStages ? "diagnostic split passes add overhead" : "last step of batch; readback excluded" };
      },
      async readPixels() {
        const bytesPerRow = Math.ceil(resolution * 4 / 256) * 256, out = device.createBuffer({ size: bytesPerRow * resolution, usage: B.COPY_DST | B.MAP_READ });
        try {
          const encoder = device.createCommandEncoder();
          encoder.copyTextureToBuffer({ texture }, { buffer: out, bytesPerRow }, [resolution, resolution]);
          device.queue.submit([encoder.finish()]);
          await out.mapAsync(GPUMapMode.READ);
          const raw = new Uint8Array(out.getMappedRange()), pixels = new Uint8Array(resolution ** 2 * 4);
          for (let y = 0; y < resolution; y++) pixels.set(raw.subarray(y * bytesPerRow, y * bytesPerRow + resolution * 4), y * resolution * 4);
          return pixels;
        } finally {
          out.destroy();
        }
      },
      dispose() {
        fft?.dispose();
        for (const b of buffers) b.destroy();
        texture.destroy();
        querySet?.destroy();
      }
    };
  } catch (error) {
    fft?.dispose();
    for (const b of buffers) b.destroy();
    texture?.destroy();
    querySet?.destroy();
    throw error;
  }
}

// baseline-008-entry.js
var baselineOptions = { "iterations": 80, "dt": 0.02, "viscosity": 625e-6, "pressureKernel": "fft-real8-inline", "resolution": 256, "raySteps": 128, "workgroup": [4, 4, 4] };
function createBaseline(device, { size = 128 } = {}) {
  return createVortex(device, { ...baselineOptions, size });
}
export {
  baselineOptions,
  createBaseline
};
