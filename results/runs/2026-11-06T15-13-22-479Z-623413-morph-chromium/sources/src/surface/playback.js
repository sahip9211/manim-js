import { createFrameLoop } from '../frame-loop.js';

// ManimGL's smooth rate function: quintic easing with zero first/second
// derivatives at both ends. MIT attribution: THIRD_PARTY_NOTICES.md.
export const rateFunctions = Object.freeze({
  linear: (t) => t,
  smooth: (t) => t * t * t * (10 + t * (-15 + 6 * t)),
});

export function createSurfacePlayback(
  canvas,
  renderer,
  { duration = 2, easing = 'smooth', driver } = {},
) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RangeError('Expected a positive duration in seconds');
  if (!Object.hasOwn(rateFunctions, easing)) throw new RangeError('Unknown easing');
  let progress = 0,
    previous,
    disposed = false,
    inViewport = true;
  const check = () => {
    if (disposed) throw new Error('Surface disposed');
  };
  const draw = () => renderer.draw(rateFunctions[easing](progress));
  const loop = createFrameLoop((time) => {
    if (loop.playing && previous !== undefined)
      progress = Math.min(1, progress + (time - previous) / (duration * 1000));
    previous = time;
    draw();
    if (progress === 1) loop.pause();
  }, driver);
  const doc = canvas.ownerDocument;
  const visibility = () => {
    previous = undefined;
    loop.setVisible(inViewport && !doc?.hidden);
  };
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          inViewport = entries[0].isIntersecting;
          visibility();
        })
      : null;
  observer?.observe(canvas);
  doc?.addEventListener('visibilitychange', visibility);
  visibility();
  loop.invalidate();
  return {
    metadata: { ...renderer.metadata, experimental: true },
    get progress() {
      return progress;
    },
    get playing() {
      return loop.playing;
    },
    seek(value) {
      check();
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new RangeError('Expected progress between zero and one');
      progress = value;
      previous = undefined;
      draw();
    },
    play() {
      check();
      if (progress === 1) progress = 0;
      previous = undefined;
      loop.play();
    },
    pause() {
      check();
      previous = undefined;
      loop.pause();
    },
    dispose(options) {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      observer?.disconnect();
      doc?.removeEventListener('visibilitychange', visibility);
      renderer.dispose(options);
    },
  };
}
