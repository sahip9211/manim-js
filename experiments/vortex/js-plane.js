// Preserve the original left-to-right f64 arithmetic, but factor the volume
// into an XY plane and Z coefficients before converting the output to f32.
export function initialVortexPlane(n) {
  const out = new Float32Array(n ** 3 * 4),
    sine = new Float64Array(n),
    cosine = new Float64Array(n),
    h = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) * h;
    sine[i] = Math.sin(a);
    cosine[i] = Math.cos(a);
  }
  const u = new Float64Array(n * n),
    v = new Float64Array(n * n),
    d = new Float64Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      u[i] = sine[x] * cosine[y];
      v[i] = -cosine[x] * sine[y];
      d[i] = 0.5 * sine[x] * sine[y];
    }
  let k = 0;
  for (let z = 0; z < n; z++) {
    const cz = cosine[z],
      sz = sine[z];
    for (let i = 0; i < n * n; i++, k += 4) {
      out[k] = u[i] * cz;
      out[k + 1] = v[i] * cz;
      out[k + 3] = 0.5 + d[i] * sz;
    }
  }
  return out;
}
