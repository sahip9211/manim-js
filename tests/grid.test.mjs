import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, cpuUpdates } from '../experiments/grid/model.js';

test('grid connectivity contains each horizontal/vertical edge once, including index-width boundary', () => {
  for (const n of [2, 7, 256, 257]) {
    const grid = makeGrid(n);
    assert.equal(grid.indices.length, 4 * n * (n - 1));
    assert.equal(grid.indices.BYTES_PER_ELEMENT, n <= 256 ? 2 : 4);
    const edges = new Set();
    for (let i = 0; i < grid.indices.length; i += 2) {
      const a = grid.indices[i],
        b = grid.indices[i + 1];
      assert.ok(a < n * n && b < n * n);
      assert.ok(b - a === n || (b - a === 1 && Math.floor(a / n) === Math.floor(b / n)));
      edges.add(`${a}:${b}`);
    }
    assert.equal(edges.size, grid.indices.length / 2);
  }
});

test('all update strategies preserve y, match the analytic map and its inverse', () => {
  for (const n of [2, 17, 64])
    for (const phase of [-2, 0, 0.8, 3, 2 * Math.PI])
      for (const a of [0, 0.25, -0.5]) {
        const grid = makeGrid(n);
        for (const update of Object.values(cpuUpdates)) {
          const buffer = grid.output.buffer;
          const out = update(grid, phase, a);
          assert.equal(out.buffer, buffer, 'updates must reuse allocation');
          for (let i = 0; i < out.length; i += 2) {
            const x = grid.rest[i],
              y = grid.rest[i + 1];
            assert.ok(Math.abs(out[i] - (x + a * Math.sin(3 * y + phase))) < 2e-7);
            assert.equal(out[i + 1], y);
            assert.ok(Math.abs(out[i] - a * Math.sin(3 * out[i + 1] + phase) - x) < 2e-7);
          }
        }
      }
});
