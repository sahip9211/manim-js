import test from 'node:test';
import assert from 'node:assert/strict';
import { initialFluid, fluidMetrics, cpuProjection } from '../experiments/fluid/model.js';

test('fluid fixture is divergence-free, periodic, bounded and nonempty', () => {
  const metrics = fluidMetrics(initialFluid(32), 32);
  assert.equal(metrics.divergenceRms, 0);
  assert.equal(metrics.nonFinite, 0);
  assert.ok(metrics.dyeMax > 0.9 && metrics.dyeMax <= 1);
  assert.ok(metrics.dyeMass > 0);
});
test('compatible divergence/gradient projection removes a manufactured periodic mode', () => {
  const size = 16,
    field = initialFluid(size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) field[(y * size + x) * 4] += Math.sin((6 * Math.PI * x) / size);
  const before = fluidMetrics(field, size),
    after = fluidMetrics(cpuProjection(field, size, 40), size);
  assert.ok(after.divergenceRms < before.divergenceRms * 0.01);
  assert.equal(after.dyeMass, before.dyeMass);
});
