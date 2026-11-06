import { makeGrid } from '../grid/model.js';

// This bound applies only to H(x,y)=(x+a*sin(3y+phase),y), an orthographic
// viewport, and |a| <= amplitudeMax. Width is in framebuffer pixels (includes DPR).
// Linear interpolation error <= max|f''| * h^2 / 8, with h=2/segments.
export function segmentBudget({
  width = 640,
  scale = 0.65,
  amplitudeMax = 0.25,
  tolerance = 0.25,
} = {}) {
  if (
    ![width, scale, tolerance].every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(amplitudeMax) ||
    amplitudeMax < 0
  )
    throw new RangeError('Invalid error budget');
  const pixelsPerUnit = (width * scale) / 2;
  const segments = Math.max(
    1,
    Math.ceil(Math.sqrt((9 * amplitudeMax * pixelsPerUnit) / (2 * tolerance))),
  );
  if (segments > 65534) throw new RangeError('Error budget exceeds experiment index capacity');
  return {
    segments,
    boundPixels: (9 * amplitudeMax * pixelsPerUnit) / (2 * segments ** 2),
    width,
    scale,
    amplitudeMax,
    tolerance,
  };
}

export function makeRepresentation(size, mode, options = {}) {
  if (!Number.isInteger(size) || size < 2 || size > 2048) throw new RangeError('Invalid grid size');
  if (!['expanded', 'instanced', 'bounded'].includes(mode))
    throw new RangeError('Unknown representation');
  const budget = segmentBudget(options);
  const segments = mode === 'bounded' ? budget.segments : size - 1;
  let batches;
  if (mode === 'expanded') {
    const grid = makeGrid(size);
    batches = [{ vertices: grid.basis, indices: grid.indices, instances: new Float32Array(4) }];
  } else {
    const vertical = new Float32Array((segments + 1) * 4);
    const indices = new Uint16Array(segments * 2);
    for (let i = 0; i <= segments; i++) {
      const y = Math.fround(-1 + (2 * i) / segments);
      vertical.set([0, y, Math.sin(3 * y), Math.cos(3 * y)], i * 4);
      if (i < segments) indices.set([i, i + 1], i * 2);
    }
    const columns = new Float32Array(size * 4),
      rows = new Float32Array(size * 4);
    for (let i = 0; i < size; i++) {
      const p = Math.fround(-1 + (2 * i) / (size - 1));
      columns.set([p, 0, 0, 0], i * 4);
      rows.set([p, Math.sin(3 * p), Math.cos(3 * p), 1], i * 4);
    }
    batches = [
      { vertices: vertical, indices, instances: columns },
      {
        vertices: new Float32Array([-1, 0, 0, 0, 1, 0, 0, 0]),
        indices: new Uint16Array([0, 1]),
        instances: rows,
      },
    ];
  }
  return {
    size,
    mode,
    segments,
    budget,
    batches,
    metadata: {
      drawCalls: batches.length,
      segments: batches.reduce((n, b) => n + ((b.indices.length / 2) * b.instances.length) / 4, 0),
      geometryBytes: batches.reduce(
        (n, b) => n + b.vertices.byteLength + b.indices.byteLength + b.instances.byteLength,
        0,
      ),
      uploadBytesPerFrame: 16,
      approximationBoundPixels: mode === 'bounded' ? budget.boundPixels : null,
      note:
        mode === 'instanced'
          ? 'Same polylines; collinear horizontal edges collapsed. Rasterization may differ at former endpoints.'
          : mode === 'bounded'
            ? 'Bound against the analytic curve, not pixel equality with the original polyline.'
            : 'Original indexed grid with precomputed sine/cosine basis.',
    },
  };
}

export function parameters(phase, amplitude, representation, out) {
  if (
    !Number.isFinite(phase) ||
    !Number.isFinite(amplitude) ||
    Math.abs(amplitude) > representation.budget.amplitudeMax
  )
    throw new RangeError('Parameters exceed geometry error budget');
  out[0] = amplitude * Math.sin(phase);
  out[1] = amplitude * Math.cos(phase);
  out[2] = representation.budget.scale;
  out[3] = 0;
  return out;
}
