import { createFrameLoop } from './frame-loop.js';
import { makeRepresentation } from '../experiments/representation/model.js';
import { createRepresentationRenderer } from '../experiments/representation/webgpu.js';
import { createWebGL2Renderer } from '../experiments/representation/webgl2.js';

// A packaged research example, not the final general-purpose scene API.
// WebGL2 is the compatibility default; WebGPU remains an explicit experiment.
export async function createGrid(
  canvas,
  { backend = 'webgl2', size = 128, tolerance = 0.25, amplitudeMax = 0.25, scale = 0.65 } = {},
) {
  if (!canvas || typeof canvas.getContext !== 'function' || canvas.width <= 0 || canvas.height <= 0)
    throw new TypeError('Expected a nonempty canvas');
  if (!['webgl2', 'webgpu'].includes(backend)) throw new RangeError('Expected webgl2 or webgpu');
  const width = canvas.width,
    height = canvas.height;
  const representation = makeRepresentation(size, 'bounded', {
    width,
    tolerance,
    amplitudeMax,
    scale,
  });
  let renderer, device, context;
  try {
    if (backend === 'webgl2')
      renderer = createWebGL2Renderer(canvas, representation, { preserveDrawingBuffer: false });
    else {
      const adapter = await globalThis.navigator?.gpu?.requestAdapter();
      if (!adapter) throw new Error('WebGPU unavailable; use WebGL2 on a fresh canvas');
      device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();
      renderer = await createRepresentationRenderer(device, representation, {
        width,
        height,
        format,
        presentView: () => context.getCurrentTexture().createView(),
      });
      context = canvas.getContext('webgpu');
      if (!context)
        throw new Error('Cannot create WebGPU context; canvas may already use another API');
      context.configure({ device, format, alphaMode: 'opaque' });
    }
  } catch (error) {
    renderer?.dispose();
    device?.destroy();
    throw error;
  }
  let phase = 0.8,
    amplitude = amplitudeMax,
    previous,
    disposed = false,
    inViewport = true;
  const loop = createFrameLoop((time) => {
    if (canvas.width !== width || canvas.height !== height) {
      loop.pause();
      throw new Error('Canvas resized: dispose and recreate to recompute the pixel error budget');
    }
    if (loop.playing && previous !== undefined)
      phase = (phase + (time - previous) / 1000) % (2 * Math.PI);
    previous = time;
    renderer.draw(phase, amplitude);
  });
  const doc = canvas.ownerDocument;
  const visibility = () => {
    previous = undefined;
    loop.setVisible(inViewport && !doc?.hidden);
  };
  doc?.addEventListener('visibilitychange', visibility);
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          inViewport = entries[0].isIntersecting;
          visibility();
        })
      : null;
  observer?.observe(canvas);
  visibility();
  loop.invalidate();
  return {
    metadata: {
      ...renderer.metadata,
      experimental: true,
      interpolationBoundPixels: representation.budget.boundPixels,
    },
    set(values) {
      if (disposed) throw new Error('Grid disposed');
      const nextPhase = values.phase ?? phase,
        nextAmplitude = values.amplitude ?? amplitude;
      if (
        !Number.isFinite(nextPhase) ||
        !Number.isFinite(nextAmplitude) ||
        Math.abs(nextAmplitude) > amplitudeMax
      )
        throw new RangeError('Parameters exceed declared error budget');
      phase = nextPhase;
      amplitude = nextAmplitude;
      previous = undefined;
      loop.invalidate();
    },
    play() {
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
      context?.unconfigure();
      device?.destroy();
    },
  };
}
