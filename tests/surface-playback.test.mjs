import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleSurface, packColor } from '../src/surface/sample.js';
import { createSurfacePlayback, rateFunctions } from '../src/surface/playback.js';

test('surface endpoints sample exact ranges, share static storage, and reject invalid coordinates/colors', () => {
  const data = sampleSurface({
    map: (u, v, out) => {
      out[0] = u;
      out[1] = v;
      out[2] = u * v;
    },
    uRange: [-1, 2],
    vRange: [3, 5],
    uSegments: 3,
    vSegments: 3,
    color: [1, 0, 1],
  });
  assert.equal(data.start, data.end);
  assert.equal(data.cpuBytes, 16 * 16);
  assert.deepEqual(Array.from(data.start.slice(0, 4)), [-1, 3, -3, 0xff00ff]);
  assert.deepEqual(Array.from(data.start.slice(-4)), [2, 5, 10, 0xff00ff]);
  assert.equal(packColor([1, 1, 1]), 0xffffff);
  for (const map of [() => [0, NaN, 0], () => [0, 1e100, 0], () => [0, 1], () => undefined])
    assert.throws(() => sampleSurface({ map, uSegments: 3, vSegments: 3 }), RangeError);
  assert.throws(() => packColor([1, 2, 0]), RangeError);
  const morph = sampleSurface({
    map: (u, v) => [u, v, 0],
    targetMap: (u, v) => [u, v, 1],
    uSegments: 3,
    vSegments: 3,
  });
  assert.notEqual(morph.start, morph.end);
  assert.equal(morph.end[2], 1);
});
test('surface playback seeks deterministically, pauses time, finishes idle, and disposes once', () => {
  let id = 0,
    disposed = 0;
  const pending = new Map(),
    frames = [];
  const doc = new EventTarget();
  doc.hidden = false;
  const scene = createSurfacePlayback(
    { ownerDocument: doc },
    { metadata: {}, draw: (a) => frames.push(a), dispose: () => disposed++ },
    {
      duration: 2,
      easing: 'smooth',
      driver: {
        request: (cb) => {
          pending.set(++id, cb);
          return id;
        },
        cancel: (i) => pending.delete(i),
      },
    },
  );
  const tick = (t) => {
    const jobs = [...pending.values()];
    pending.clear();
    jobs.forEach((f) => f(t));
  };
  tick(0);
  assert.equal(pending.size, 0);
  scene.play();
  tick(0);
  tick(1000);
  assert.equal(frames.at(-1), 0.5);
  scene.pause();
  assert.equal(pending.size, 0);
  scene.seek(0.25);
  assert.equal(frames.at(-1), rateFunctions.smooth(0.25));
  scene.play();
  tick(5000);
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pending.size, 0);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  tick(9000);
  assert.equal(scene.progress, 0.25);
  tick(10500);
  assert.equal(scene.progress, 1);
  assert.equal(scene.playing, false);
  assert.equal(pending.size, 0);
  scene.dispose();
  scene.dispose();
  assert.equal(disposed, 1);
  assert.throws(() => scene.seek(0.5));
  assert.throws(() => scene.play());
  assert.equal(rateFunctions.smooth(0), 0);
  assert.equal(rateFunctions.smooth(1), 1);
  assert.throws(() => createSurfacePlayback({}, {}, { easing: 'toString' }), RangeError);
});
