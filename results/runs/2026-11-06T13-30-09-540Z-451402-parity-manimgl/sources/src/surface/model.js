export function validateSurfaceOptions({ uSegments = 512, vSegments = 256 } = {}) {
  if (!Number.isInteger(uSegments) || !Number.isInteger(vSegments) || uSegments < 3 || vSegments < 3 || uSegments > 2048 || vSegments > 2048) {
    throw new RangeError('Surface segments must be integers between 3 and 2048');
  }
  return { uSegments, vSegments, nu: uSegments + 1, nv: vSegments + 1 };
}

export function torusPoint(u, v, phase, out = new Float32Array(3), offset = 0) {
  const radius = 0.62 + 0.1 * Math.sin(6 * u + 2 * v - phase);
  const x = (2 + radius * Math.cos(v)) * Math.cos(u);
  const y = (2 + radius * Math.cos(v)) * Math.sin(u);
  const z = radius * Math.sin(v) + 0.2 * Math.sin(3 * u + phase);
  const yy = Math.cos(0.8) * y - Math.sin(0.8) * z;
  out[offset] = Math.cos(0.25 * phase) * x - Math.sin(0.25 * phase) * yy;
  out[offset + 1] = Math.sin(0.25 * phase) * x + Math.cos(0.25 * phase) * yy;
  out[offset + 2] = Math.sin(0.8) * y + Math.cos(0.8) * z;
  return out;
}

export function surfaceIndices(nu, nv) {
  const indices = new Uint32Array((nu - 1) * (nv - 1) * 6);
  let k = 0;
  for (let u = 0; u < nu - 1; u++) for (let v = 0; v < nv - 1; v++) {
    const a = u * nv + v, b = a + nv, c = a + 1, d = b + 1;
    indices.set([a, b, c, c, b, d], k); k += 6;
  }
  return indices;
}

export function surfaceBasis(count, axis) {
  const data = new Float32Array(count * 4);
  const frequency = axis === 'u' ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const angle = 2 * Math.PI * i / (count - 1);
    data.set([Math.cos(angle), Math.sin(angle), Math.sin(frequency * angle), Math.cos(frequency * angle)], 4*i);
  }
  return data;
}
