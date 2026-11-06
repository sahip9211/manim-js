import { createFrameLoop } from './frame-loop.js';
import { createSurfaceRenderer } from './surface/webgl2.js';

// One parametric animation fixture; this is not a general Manim scene interpreter.
export async function createWaveTorus(canvas, options = {}) {
  const renderer = createSurfaceRenderer(canvas, options);
  let phase = 0,
    previous,
    disposed = false,
    inViewport = true;
  const loop = createFrameLoop((time) => {
    if (loop.playing && previous !== undefined)
      phase = (phase + (time - previous) / 1000) % (8 * Math.PI);
    previous = time;
    renderer.draw(phase);
  });
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
    set({ phase: next }) {
      if (disposed) throw new Error('Surface disposed');
      if (!Number.isFinite(next)) throw new RangeError('Expected finite phase');
      phase = next;
      previous = undefined;
      loop.invalidate();
    },
    render(next = phase) {
      if (disposed) throw new Error('Surface disposed');
      if (!Number.isFinite(next)) throw new RangeError('Expected finite phase');
      phase = next;
      previous = undefined;
      renderer.draw(phase);
    },
    play() {
      if (disposed) throw new Error('Surface disposed');
      previous = undefined;
      loop.play();
    },
    pause() {
      previous = undefined;
      loop.pause();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      observer?.disconnect();
      doc?.removeEventListener('visibilitychange', visibility);
      renderer.dispose();
    },
  };
}
