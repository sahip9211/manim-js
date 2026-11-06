import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../src/index.js';

function fixture() {
  let id = 0,
    draws = 0;
  const pending = new Map();
  const loop = createFrameLoop(
    () => {
      draws++;
    },
    {
      request(cb) {
        pending.set(++id, cb);
        return id;
      },
      cancel(key) {
        pending.delete(key);
      },
    },
  );
  return {
    loop,
    pending,
    get draws() {
      return draws;
    },
    step(time = 0) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(time);
    },
  };
}

test('static scenes schedule no frames; invalidations coalesce into one draw', () => {
  const f = fixture();
  assert.equal(f.pending.size, 0);
  for (let i = 0; i < 100; i++) f.loop.invalidate();
  assert.equal(f.pending.size, 1);
  f.step();
  assert.equal(f.draws, 1);
  assert.equal(f.pending.size, 0);
});
test('playing schedules one frame at a time; pausing cancels future work', () => {
  const f = fixture();
  f.loop.play();
  f.step();
  f.step();
  assert.equal(f.draws, 2);
  assert.equal(f.pending.size, 1);
  f.loop.pause();
  assert.equal(f.pending.size, 0);
});
test('offscreen work is suspended and invalidations survive until visible', () => {
  const f = fixture();
  f.loop.play();
  f.loop.setVisible(false);
  f.loop.invalidate();
  f.step();
  assert.equal(f.draws, 0);
  assert.equal(f.pending.size, 0);
  f.loop.pause();
  f.loop.setVisible(true);
  f.step();
  assert.equal(f.draws, 1);
  assert.equal(f.pending.size, 0);
});
test('pausing does not lose a pending static update', () => {
  const f = fixture();
  f.loop.play();
  f.loop.invalidate();
  f.loop.pause();
  f.step();
  assert.equal(f.draws, 1);
  assert.equal(f.pending.size, 0);
});
test('dispose cancels work and subsequent methods cannot restart it', () => {
  const f = fixture();
  f.loop.play();
  f.loop.dispose();
  f.loop.invalidate();
  f.loop.play();
  f.loop.setVisible(true);
  f.step();
  assert.equal(f.draws, 0);
  assert.equal(f.pending.size, 0);
  assert.equal(f.loop.playing, false);
});
