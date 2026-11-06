import test from 'node:test';
import assert from 'node:assert/strict';
import {
  surfaceIndices,
  torusPoint,
  validateSurfaceOptions,
  surfaceBasis,
} from '../src/surface/model.js';

test('surface triangulation shares vertices and covers every cell with consistent winding', () => {
  const nu = 5,
    nv = 4,
    indices = surfaceIndices(nu, nv);
  assert.equal(indices.length, (nu - 1) * (nv - 1) * 6);
  const areas = [];
  for (let k = 0; k < indices.length; k += 3) {
    const coords = Array.from(indices.subarray(k, k + 3), (i) => [Math.floor(i / nv), i % nv]);
    for (const i of indices.subarray(k, k + 3)) assert.ok(i < nu * nv);
    const [a, b, c] = coords;
    areas.push(((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2);
  }
  assert.ok(areas.every((x) => x === 0.5));
  assert.equal(
    areas.reduce((a, b) => a + b, 0),
    (nu - 1) * (nv - 1),
  );
});
test('travelling-wave torus closes both seams and changes over time', () => {
  for (const phase of [0, 0.7, 3.4, 5.6])
    for (const a of [0.2, 1.4, 4.8])
      for (const [p, q] of [
        [torusPoint(0, a, phase), torusPoint(2 * Math.PI, a, phase)],
        [torusPoint(a, 0, phase), torusPoint(a, 2 * Math.PI, phase)],
      ])
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(p[k] - q[k]) < 1e-6);
  assert.notDeepEqual(torusPoint(0.7, 1.2, 0), torusPoint(0.7, 1.2, 1));
  for (const axis of ['u', 'v']) {
    const basis = surfaceBasis(33, axis);
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(basis[k] - basis[basis.length - 4 + k]) < 1e-6);
  }
});
test('surface resolution rejects invalid and unbounded allocations', () => {
  for (const n of [0, -1, NaN, 4.5, 4096])
    assert.throws(() => validateSurfaceOptions({ uSegments: n }), RangeError);
});

test('tile ordering preserves exactly the same oriented triangles on partial tiles', () => {
  const triangles = (indices) =>
    Array.from({ length: indices.length / 3 }, (_, i) =>
      Array.from(indices.subarray(i * 3, i * 3 + 3)).join(','),
    ).sort();
  for (const [nu, nv] of [
    [5, 4],
    [20, 18],
    [33, 17],
  ])
    assert.deepEqual(triangles(surfaceIndices(nu, nv, 8)), triangles(surfaceIndices(nu, nv)));
});

test('the combined travelling wave and rotation close after four wave cycles', () => {
  const a = torusPoint(0.7, 1.2, 0),
    b = torusPoint(0.7, 1.2, 8 * Math.PI);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6);
});
