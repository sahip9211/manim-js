import { sampleSurface } from './surface/sample.js';
import { createSurfaceRenderer } from './surface/webgl2.js';
import { createSurfacePlayback, rateFunctions } from './surface/playback.js';

// Same-grid, opaque Surface/Transform subset. Endpoint maps run only at creation.
export async function createSurface(canvas, options = {}) {
  const { duration = 2, easing = 'smooth' } = options;
  if (!Number.isFinite(duration) || duration <= 0 || !Object.hasOwn(rateFunctions, easing))
    throw new RangeError('Expected positive duration and linear or smooth easing');
  const resolution = { uSegments: 100, vSegments: 100, ...options };
  const geometry = sampleSurface(resolution);
  const renderer = createSurfaceRenderer(canvas, { ...resolution, geometry });
  try {
    return createSurfacePlayback(canvas, renderer, { duration, easing });
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}
