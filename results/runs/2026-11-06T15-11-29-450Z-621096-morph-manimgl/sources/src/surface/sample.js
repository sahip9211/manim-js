import { validateSurfaceOptions } from './model.js';

function range(value, name) {
  if (!value || value.length !== 2 || !value.every(Number.isFinite) || value[0] === value[1])
    throw new RangeError(`Expected a finite nonempty ${name}`);
  return value;
}

// RGB8 is stored exactly in a float32's 24-bit integer range, alongside xyz.
// This avoids a separate per-vertex color texture or buffer.
export function packColor(color) {
  if (
    !color ||
    color.length !== 3 ||
    !Array.from(color).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  )
    throw new RangeError('Expected three color components between zero and one');
  return (
    Math.round(color[0] * 255) * 65536 +
    Math.round(color[1] * 255) * 256 +
    Math.round(color[2] * 255)
  );
}

export function sampleSurface({
  map,
  targetMap,
  color = [0.3, 0.7, 0.9],
  targetColor = color,
  uRange = [0, 1],
  vRange = [0, 1],
  ...options
} = {}) {
  if (typeof map !== 'function' || (targetMap !== undefined && typeof targetMap !== 'function'))
    throw new TypeError('Expected a surface map and optional targetMap');
  const { nu, nv } = validateSurfaceOptions(options);
  const ur = range(uRange, 'uRange'),
    vr = range(vRange, 'vRange');
  const sample = (fn, paint) => {
    const data = new Float32Array(nu * nv * 4);
    const out = new Float64Array(3);
    const constantColor = typeof paint === 'function' ? null : packColor(paint);
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const u = ur[0] + ((ur[1] - ur[0]) * i) / (nu - 1),
          v = vr[0] + ((vr[1] - vr[0]) * j) / (nv - 1);
        out.fill(NaN);
        const p = fn(u, v, out) ?? out,
          offset = (i * nv + j) * 4;
        if (!p || p.length !== 3)
          throw new RangeError('Surface map must produce three coordinates');
        for (let k = 0; k < 3; k++) {
          const value = Math.fround(p[k]);
          if (!Number.isFinite(value))
            throw new RangeError('Surface coordinates must fit finite float32 values');
          data[offset + k] = value;
        }
        data[offset + 3] = constantColor ?? packColor(paint(u, v));
      }
    return data;
  };
  const start = sample(map, color);
  const end =
    targetMap === undefined && targetColor === color
      ? start
      : sample(targetMap ?? map, targetColor);
  return { nu, nv, start, end, cpuBytes: start.byteLength + (end === start ? 0 : end.byteLength) };
}
