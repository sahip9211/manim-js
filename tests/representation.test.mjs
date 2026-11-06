import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRepresentation,
  segmentBudget,
  parameters,
} from '../experiments/representation/model.js';

test('curvature bound holds over phase, sign, amplitude and framebuffer resolution', () => {
  for (const width of [320, 640, 1920, 3840])
    for (const amplitudeMax of [0, 0.1, 0.25, 1]) {
      const budget = segmentBudget({ width, amplitudeMax });
      assert.ok(budget.boundPixels <= budget.tolerance);
      for (const phase of [0, 0.7, Math.PI / 2, 2.9, 5.8])
        for (const sign of [-1, 1]) {
          const f = (y) => sign * amplitudeMax * Math.sin(3 * y + phase);
          for (let i = 0; i < budget.segments; i++) {
            const a = -1 + (2 * i) / budget.segments,
              b = -1 + (2 * (i + 1)) / budget.segments;
            for (let t = 0; t <= 1; t += 0.05) {
              const difference =
                (Math.abs(f(a + (b - a) * t) - (f(a) * (1 - t) + f(b) * t)) *
                  width *
                  budget.scale) /
                2;
              assert.ok(difference <= budget.boundPixels + 1e-9);
            }
          }
        }
    }
});

test('instanced geometry describes the same grid and remains inside its declared error budget', () => {
  // Evaluate the shader expression independently in JS, including f32 stored bases.
  for (const mode of ['expanded', 'instanced', 'bounded']) {
    const r = makeRepresentation(33, mode);
    for (const phase of [0, 0.8, 2.4]) {
      const u = parameters(phase, 0.25, r, new Float32Array(4));
      for (const b of r.batches)
        for (let j = 0; j < b.instances.length; j += 4)
          for (let i = 0; i < b.vertices.length; i += 4) {
            const p = b.vertices.subarray(i, i + 4),
              inst = b.instances.subarray(j, j + 4);
            const y = inst[3] ? inst[0] : p[1];
            const baseX = inst[3] ? p[0] : p[0] + inst[0];
            const x = inst[3]
              ? p[0] + inst[1] * u[1] + inst[2] * u[0]
              : baseX + p[2] * u[1] + p[3] * u[0];
            assert.ok(Math.abs(x - (baseX + 0.25 * Math.sin(3 * y + phase))) < 1e-7);
          }
    }
    for (const b of r.batches)
      for (const index of b.indices) assert.ok(index < b.vertices.length / 4);
    assert.throws(() => parameters(0, 0.26, r, new Float32Array(4)), RangeError);
  }
  assert.equal(makeRepresentation(256, 'instanced').metadata.segments, 256 * 256);
  assert.equal(makeRepresentation(256, 'bounded').metadata.segments, 8192);
});

test('pixel budgets reject invalid inputs and excessive tessellation', () => {
  for (const options of [
    { width: 0 },
    { amplitudeMax: -1 },
    { tolerance: 0 },
    { tolerance: 1e-20 },
  ])
    assert.throws(() => segmentBudget(options), RangeError);
});
