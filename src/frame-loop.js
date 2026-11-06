/**
 * Demand-driven frame scheduling, independent of renderer or UI framework.
 * Animation state belongs to the consumer; this only schedules work.
 * @param {(time: number) => void} render
 * @param {{request?: (cb: FrameRequestCallback) => number, cancel?: (id: number) => void}} driver
 */
export function createFrameLoop(render, driver = {}) {
  const request = driver.request ?? globalThis.requestAnimationFrame.bind(globalThis);
  const cancel = driver.cancel ?? globalThis.cancelAnimationFrame.bind(globalThis);
  let pending = null,
    dirty = false,
    playing = false,
    visible = true,
    disposed = false;
  const schedule = () => {
    if (!disposed && visible && pending === null && (dirty || playing)) pending = request(tick);
  };
  const unschedule = () => {
    if (pending !== null) {
      cancel(pending);
      pending = null;
    }
  };
  function tick(time) {
    pending = null;
    if (disposed || !visible) return;
    dirty = false;
    render(time);
    schedule();
  }
  return {
    invalidate() {
      if (disposed) return;
      dirty = true;
      schedule();
    },
    play() {
      if (disposed) return;
      playing = true;
      schedule();
    },
    pause() {
      playing = false;
      if (!dirty) unschedule();
    },
    setVisible(value) {
      if (disposed) return;
      visible = !!value;
      if (!visible) unschedule();
      else schedule();
    },
    dispose() {
      disposed = true;
      playing = false;
      dirty = false;
      unschedule();
    },
    get playing() {
      return playing;
    },
  };
}
