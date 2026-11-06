// Experiment fixture, not the public Lean-JS API.
// H_a(x,y) = (x + a sin(3y + phase), y) has inverse
// H_a^-1(x,y) = (x - a sin(3y + phase), y). No tearing/folding.
export function makeGrid(size) {
  if (!Number.isInteger(size) || size < 2 || size > 2048) throw new RangeError('Grid size must be an integer in [2, 2048]');
  const count = size * size;
  const rest = new Float32Array(count * 2);
  const basis = new Float32Array(count * 4);
  const rowSin = new Float64Array(size);
  const rowCos = new Float64Array(size);
  for (let y = 0; y < size; y++) {
    const v = Math.fround(-1 + 2 * y / (size - 1));
    rowSin[y] = Math.sin(3 * v);
    rowCos[y] = Math.cos(3 * v);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = Math.fround(-1 + 2 * x / (size - 1));
      rest.set([u, v], i * 2);
      basis.set([u, v, rowSin[y], rowCos[y]], i * 4);
    }
  }
  const IndexArray = count <= 65536 ? Uint16Array : Uint32Array;
  const indices = new IndexArray(4 * size * (size - 1));
  let cursor = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (x + 1 < size) { indices[cursor++] = i; indices[cursor++] = i + 1; }
    if (y + 1 < size) { indices[cursor++] = i; indices[cursor++] = i + size; }
  }
  return { size, count, rest, basis, rowSin, rowCos, indices, output: new Float32Array(rest.length) };
}

export function updateNaive(grid, phase, amplitude) {
  const { rest, output } = grid;
  for (let i = 0; i < rest.length; i += 2) {
    output[i] = rest[i] + amplitude * Math.sin(3 * rest[i + 1] + phase);
    output[i + 1] = rest[i + 1];
  }
  return output;
}

export function updateRows(grid, phase, amplitude) {
  const { rest, output, size } = grid;
  for (let y = 0; y < size; y++) {
    const start = y * size * 2;
    const offset = amplitude * Math.sin(3 * rest[start + 1] + phase);
    for (let i = start; i < start + size * 2; i += 2) {
      output[i] = rest[i] + offset;
      output[i + 1] = rest[i + 1];
    }
  }
  return output;
}

export function updateBasis(grid, phase, amplitude) {
  const { rest, output, size, rowSin, rowCos } = grid;
  const s = Math.sin(phase) * amplitude;
  const c = Math.cos(phase) * amplitude;
  for (let y = 0; y < size; y++) {
    const start = y * size * 2;
    const offset = rowSin[y] * c + rowCos[y] * s;
    for (let i = start; i < start + size * 2; i += 2) {
      output[i] = rest[i] + offset;
      output[i + 1] = rest[i + 1];
    }
  }
  return output;
}

export const cpuUpdates = { 'cpu-naive': updateNaive, 'cpu-rows': updateRows, 'cpu-basis': updateBasis };

export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
  return { n: sorted.length, median: pick(0.5), p95: pick(0.95), p99: pick(0.99), min: sorted[0] ?? null, max: sorted.at(-1) ?? null };
}

export function shuffled(values, seed = 12345) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
