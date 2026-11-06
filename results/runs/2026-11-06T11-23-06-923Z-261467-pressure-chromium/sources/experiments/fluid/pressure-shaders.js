// Generate fixed-size variants without changing the f32 stencil or iteration
// order. A power-of-two periodic grid admits exact bit-mask wrapping.
export function specializeGrid(code, size) {
  code = code.replaceAll('params.n', `${size}u`);
  if ((size & (size - 1)) === 0) {
    code = code.replace(/fn at\(x: i32, y: i32\) -> u32 \{[^}]+\}/,
      `fn at(x: i32, y: i32) -> u32 { return (u32(y) & ${size - 1}u) * ${size}u + (u32(x) & ${size - 1}u); }`);
  }
  return code;
}

export function temporalPressure(workgroup, depth) {
  const side = workgroup + 2 * depth, cells = side * side, lanes = workgroup * workgroup;
  const stencil = name => `0.25 * (${name}[k-1u] + ${name}[k+1u] + ${name}[k-${side}u] + ${name}[k+${side}u] - blockD[k])`;
  let code = `
var<workgroup> blockP: array<f32, ${cells}>;
var<workgroup> blockQ: array<f32, ${cells}>;
var<workgroup> blockD: array<f32, ${cells}>;
@compute @workgroup_size(${workgroup}, ${workgroup}) fn jacobiTemporal(
  @builtin(local_invocation_id) local: vec3u,
  @builtin(local_invocation_index) lane: u32,
  @builtin(workgroup_id) group: vec3u
) {
  let base = vec2i(group.xy * ${workgroup}u) - vec2i(${depth});
  for (var k = lane; k < ${cells}u; k += ${lanes}u) {
    let i = at(base.x + i32(k % ${side}u), base.y + i32(k / ${side}u));
    blockP[k] = p[i]; blockD[k] = div[i];
  }
  workgroupBarrier();
`;
  // Shrink the valid region each iteration. Workgroups communicate only via
  // the initial halo, never through an invalid cross-workgroup barrier.
  for (let step = 1; step < depth; step++) {
    const src = step % 2 ? 'blockP' : 'blockQ', dst = step % 2 ? 'blockQ' : 'blockP';
    const interior = side - 2 * step;
    code += `{
      for (var j = lane; j < ${interior ** 2}u; j += ${lanes}u) {
        let k = (j / ${interior}u + ${step}u) * ${side}u + j % ${interior}u + ${step}u;
        ${dst}[k] = ${stencil(src)};
      }
      workgroupBarrier();
    }`;
  }
  return code + `
  let id = group.xy * ${workgroup}u + local.xy;
  if (id.x < params.n && id.y < params.n) {
    let k = (local.y + ${depth}u) * ${side}u + local.x + ${depth}u;
    q[id.y * params.n + id.x] = ${stencil(depth % 2 ? 'blockP' : 'blockQ')};
  }
}`;
}

// Four adjacent scalar stencil updates per invocation. Storage is unchanged:
// a vec4 view of each contiguous group of four f32 pressure/divergence values.
export function packedPressure(workgroup, width = 4) {
  const vectors = width / 4;
  const [wx, wy] = Array.isArray(workgroup) ? workgroup : [workgroup, workgroup];
  return `
struct Params { n: u32, dt: f32, pad: vec2f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> p: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> q: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> div: array<vec4f>;
@compute @workgroup_size(${wx}, ${wy}) fn jacobiPacked(@builtin(global_invocation_id) id: vec3u) {
  let cols = params.n / 4u; let n = params.n;
  let x = id.x * ${vectors}u;
  if (x >= cols || id.y >= n) { return; }
  let i = id.y * cols + x;
  let left = select(i-1u, i+cols-1u, x==0u);
  let right = select(i+${vectors}u, i-cols+${vectors}u, x+${vectors}u==cols);
  let bottom = select(i-cols, i+cols*(n-1u), id.y==0u);
  let top = select(i+cols, i-cols*(n-1u), id.y+1u==n);
  ${Array.from({length:vectors},(_,v)=>`let center${v} = p[i+${v}u];`).join('\n')}
  ${Array.from({length:vectors},(_,v)=>`q[i+${v}u] = 0.25 * (vec4f(${v ? `center${v-1}.w` : 'p[left].w'},center${v}.xyz) + vec4f(center${v}.yzw,${v+1<vectors ? `center${v+1}.x` : 'p[right].x'}) + p[bottom+${v}u] + p[top+${v}u] - div[i+${v}u]);`).join('\n')}
}`;
}
