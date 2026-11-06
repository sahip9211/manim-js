import { jacobiSpectrum } from './fft-pressure.js';

// Mixed radix 4/2 Stockham, with contiguous independent transforms batched
// across the strided axes. No global volume transposes or bit-reversal pass.
function shader(n, axis, inverse, realInput, realOutput, filter, batch) {
  const lanes = n / 4,
    radices = [];
  for (let left = n; left > 1; ) {
    const r = left % 4 === 0 ? 4 : 2;
    radices.push(r);
    left /= r;
  }
  const shared = (k) => (axis === 0 ? `(line*${n}u+(${k}))` : `((${k})*${batch}u+line)`);
  const index = (k) =>
    axis === 0
      ? `(row*${n}u+(${k}))`
      : axis === 1
        ? `(group.y*${n * n}u+(${k})*${n}u+x)`
        : `((${k})*${n * n}u+group.y*${n}u+x)`;
  let ns = 1;
  const stages = radices
    .map((radix, s) => {
      const first = s === 0,
        last = s === radices.length - 1,
        src = s % 2 ? 'a' : 'b',
        dst = s % 2 ? 'b' : 'a';
      const read = (k) =>
        first
          ? realInput
            ? `vec2f(input[${index(k)}],0.0)`
            : `input[${index(k)}]`
          : `vec2f(${src}r[${shared(k)}],${src}i[${shared(k)}])`;
      let code = `{ for(var j=lane;j<${n / radix}u;j+=${lanes}u) {\n`;
      for (let r = 0; r < radix; r++) {
        code += `var v${r}=${read(`j+${(r * n) / radix}u`)};\n`;
        if (r && ns > 1)
          code += `var w${r}=twiddles[${r}u*(j%${ns}u)*${n / (ns * radix)}u];${inverse ? `w${r}.y=-w${r}.y;` : ''}v${r}=mul(v${r},w${r});\n`;
      }
      if (radix === 4)
        code += `let evenSum=v0+v2;let evenDiff=v0-v2;let oddSum=v1+v3;let oddDiff=v1-v3;let rot=${inverse ? 'vec2f(-oddDiff.y,oddDiff.x)' : 'vec2f(oddDiff.y,-oddDiff.x)'};let o0=evenSum+oddSum;let o1=evenDiff+rot;let o2=evenSum-oddSum;let o3=evenDiff-rot;\n`;
      else code += 'let o0=v0+v1;let o1=v0-v1;\n';
      code += `let base=(j/${ns}u)*${ns * radix}u+j%${ns}u;\n`;
      for (let r = 0; r < radix; r++) {
        const k = `base+${r * ns}u`;
        if (last)
          code += `output[${index(k)}]=${realOutput ? `o${r}.x/${n}.0` : `o${r}${inverse ? `/${n}.0` : filter ? `*factors[${index(k)}]` : ''}`};\n`;
        else code += `${dst}r[${shared(k)}]=o${r}.x;${dst}i[${shared(k)}]=o${r}.y;\n`;
      }
      code += '}}\n';
      if (!last) code += 'workgroupBarrier();\n';
      ns *= radix;
      return code;
    })
    .join('');
  return `
@group(0) @binding(0) var<storage,read> input:array<${realInput ? 'f32' : 'vec2f'}>;
@group(0) @binding(1) var<storage,read_write> output:array<${realOutput ? 'f32' : 'vec2f'}>;
@group(0) @binding(2) var<storage,read> twiddles:array<vec2f>;
${filter ? '@group(0) @binding(3) var<storage,read> factors:array<f32>;' : ''}
var<workgroup> ar:array<f32,${n * batch}>;var<workgroup> ai:array<f32,${n * batch}>;
var<workgroup> br:array<f32,${n * batch}>;var<workgroup> bi:array<f32,${n * batch}>;
fn mul(a:vec2f,b:vec2f)->vec2f{return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
@compute @workgroup_size(${axis === 0 ? `${lanes},${batch}` : `${batch},${lanes}`}) fn main(@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u) {
  let lane=local.${axis === 0 ? 'x' : 'y'};let line=local.${axis === 0 ? 'y' : 'x'};
  ${axis === 0 ? `let row=group.x*${batch}u+line;` : `let x=group.x*${batch}u+line;`}
  ${stages}
}`;
}

export async function createStockhamPressure(
  device,
  { size: n, iterations, divergence, pressure, staticBuffers = false },
) {
  if (!Number.isInteger(n) || n < 8 || n > 128 || n & (n - 1))
    throw new RangeError('Stockham volume requires powers of two in [8,128]');
  const buffers = [],
    buffer = (size, data) => {
      const b = device.createBuffer({
        size,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: !!data,
      });
      buffers.push(b);
      if (data) {
        new Float32Array(b.getMappedRange()).set(data);
        b.unmap();
      }
      return b;
    };
  try {
    const a = buffer(n ** 3 * 8),
      b = buffer(n ** 3 * 8),
      tw = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      tw[2 * k] = Math.cos((-2 * Math.PI * k) / n);
      tw[2 * k + 1] = Math.sin((-2 * Math.PI * k) / n);
    }
    const twiddles = buffer(tw.byteLength, tw),
      f = jacobiSpectrum(n, iterations, 3),
      factors = buffer(f.byteLength, f),
      stages = [];
    for (const [axis, inverse, input, output, realInput, realOutput, filter] of [
      [0, false, divergence, a, true, false, false],
      [1, false, a, b, false, false, false],
      [2, false, b, a, false, false, true],
      [2, true, a, b, false, false, false],
      [1, true, b, a, false, false, false],
      [0, true, a, pressure, false, true, false],
    ]) {
      const batch = axis === 0 ? 4 : 8;
      const pipeline = await device.createComputePipelineAsync({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({
            code: staticBuffers
              ? shader(n, axis, inverse, realInput, realOutput, filter, batch)
                  .replace(/(input|output):array<(f32|vec2f)>/g, `$1:array<$2,${n ** 3}>`)
                  .replace('twiddles:array<vec2f>', `twiddles:array<vec2f,${n}>`)
                  .replace('factors:array<f32>', `factors:array<f32,${n ** 3}>`)
              : shader(n, axis, inverse, realInput, realOutput, filter, batch),
          }),
          entryPoint: 'main',
        },
      });
      const resources = [input, output, twiddles, ...(filter ? [factors] : [])];
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: resources.map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
      stages.push({
        pipeline,
        group,
        x: axis === 0 ? (n * n) / batch : n / batch,
        y: axis === 0 ? 1 : n,
      });
    }
    return {
      metadata: {
        dimensions: 3,
        dispatches: 6,
        bufferBytes: buffers.reduce((s, b) => s + b.size, 0),
        workgroupStorageBytes: n * 8 * 16,
        method: 'radix-4/2 Stockham, batched strided transforms, finite-iteration Jacobi',
      },
      encode(pass) {
        for (let i = 0; i < stages.length; i++) {
          const s = stages[i];
          pass.setPipeline(s.pipeline);
          pass.setBindGroup(0, s.group);
          pass.dispatchWorkgroups(s.x, s.y);
        }
      },
      dispose() {
        for (const b of buffers) b.destroy();
      },
    };
  } catch (error) {
    for (const b of buffers) b.destroy();
    throw error;
  }
}
