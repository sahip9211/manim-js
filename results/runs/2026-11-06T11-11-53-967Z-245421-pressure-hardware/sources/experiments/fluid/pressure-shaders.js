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
