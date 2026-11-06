// Periodic 2D incompressible-flow workload. Velocity units: cells/second.
// Dye is transported semi-Lagrangianly: bounded but not mass-conserving.
export function initialFluid(size) {
  if (!Number.isInteger(size) || size < 8 || size > 1024)
    throw new RangeError('Fluid size must be in [8,1024]');
  const data = new Float32Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        u = (x + 0.5) / size,
        v = (y + 0.5) / size;
      // Exactly divergence-free under backward differences: each component is
      // independent of its own differentiation coordinate.
      data[i] = size * 0.15 * Math.sin(4 * Math.PI * v);
      data[i + 1] = -size * 0.15 * Math.sin(4 * Math.PI * u);
      data[i + 2] = Math.exp(-60 * ((u - 0.35) ** 2 + (v - 0.5) ** 2));
    }
  return data;
}

export function fluidMetrics(data, size) {
  let nonFinite = 0,
    dyeMin = Infinity,
    dyeMax = -Infinity,
    dyeMass = 0,
    div2 = 0,
    energy = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        left = (y * size + ((x + size - 1) % size)) * 4,
        bottom = (((y + size - 1) % size) * size + x) * 4;
      for (let k = 0; k < 4; k++) if (!Number.isFinite(data[i + k])) nonFinite++;
      const div = data[i] - data[left] + data[i + 1] - data[bottom + 1];
      div2 += div * div;
      energy += data[i] ** 2 + data[i + 1] ** 2;
      dyeMin = Math.min(dyeMin, data[i + 2]);
      dyeMax = Math.max(dyeMax, data[i + 2]);
      dyeMass += data[i + 2];
    }
  return {
    nonFinite,
    dyeMin,
    dyeMax,
    dyeMass,
    divergenceRms: Math.sqrt(div2 / (size * size)),
    meanKineticEnergy: energy / (2 * size * size),
  };
}

export function cpuProjection(field, size, iterations) {
  const count = size * size,
    div = new Float64Array(count);
  let p = new Float64Array(count),
    q = new Float64Array(count);
  const index = (x, y) => ((y + size) % size) * size + ((x + size) % size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = index(x, y);
      div[i] =
        field[i * 4] -
        field[index(x - 1, y) * 4] +
        field[i * 4 + 1] -
        field[index(x, y - 1) * 4 + 1];
    }
  for (let k = 0; k < iterations; k++) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        q[index(x, y)] =
          (p[index(x - 1, y)] +
            p[index(x + 1, y)] +
            p[index(x, y - 1)] +
            p[index(x, y + 1)] -
            div[index(x, y)]) *
          0.25;
    [p, q] = [q, p];
  }
  const out = Float32Array.from(field);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = index(x, y);
      out[i * 4] -= p[index(x + 1, y)] - p[i];
      out[i * 4 + 1] -= p[index(x, y + 1)] - p[i];
    }
  return out;
}
