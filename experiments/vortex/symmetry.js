// Quotient by translations (N/2,N/2,0) and (N/2,0,N/2).
// Logical resolution stays N³. Stored coordinates have full x and half y/z;
// crossing either short boundary shifts x by N/2 (a twisted periodic boundary).
export function symmetryIndex(x, y, z, n) {
  const m = n / 2,
    flip = Number(y >= m !== z >= m);
  return ((z & (m - 1)) * m + (y & (m - 1))) * n + ((x + flip * m) & (n - 1));
}
export function packSymmetry(field, n) {
  if (!(field instanceof Float32Array) || field.length !== n ** 3 * 4)
    throw new RangeError('Expected a full logical field');
  const m = n / 2,
    out = new Float32Array(n * m * m * 4);
  for (let z = 0; z < m; z++)
    for (let y = 0; y < m; y++)
      out.set(field.subarray((z * n + y) * n * 4, (z * n + y + 1) * n * 4), (z * m + y) * n * 4);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = ((z * n + y) * n + x) * 4,
          j = symmetryIndex(x, y, z, n) * 4;
        for (let c = 0; c < 4; c++)
          if (!Number.isFinite(field[i + c]) || field[i + c] !== out[j + c])
            throw new RangeError('Field does not have the required exact translation symmetries');
      }
  return out;
}
export function expandSymmetry(field, n) {
  const out = new Float32Array(n ** 3 * 4);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = ((z * n + y) * n + x) * 4,
          j = symmetryIndex(x, y, z, n) * 4;
        out[i] = field[j];
        out[i + 1] = field[j + 1];
        out[i + 2] = field[j + 2];
        out[i + 3] = field[j + 3];
      }
  return out;
}
export function foldWGSL(n, name = 'at') {
  return `fn ${name}(v:vec3i)->u32 {
  let a=vec3u(v)&vec3u(${n - 1}u);let flip=((a.y/${n / 2}u)^(a.z/${n / 2}u))*${n / 2}u;
  return ((a.z&${n / 2 - 1}u)*${n / 2}u+(a.y&${n / 2 - 1}u))*${n}u+((a.x+flip)&${n - 1}u);
}`;
}
