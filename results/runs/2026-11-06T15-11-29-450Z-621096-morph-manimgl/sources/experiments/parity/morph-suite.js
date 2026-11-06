import { sampleSurface } from '../../src/surface/sample.js';
import { torusPoint } from '../../src/surface/model.js';
import { createSurfaceRenderer } from '../../src/surface/webgl2.js';
import { benchmarkCase, sustainedCase } from './browser-suite.js';

export function morphOptions(config) {
  const color = (u, v) =>
    [0.25 + 0.3 * (Math.cos(u) + 1), 0.35 + 0.15 * (Math.sin(v) + 1), 0.8].map(
      (c) => Math.round(c * 255) / 255,
    );
  return {
    ...config,
    uRange: [0, 2 * Math.PI],
    vRange: [0, 2 * Math.PI],
    map: (u, v) => torusPoint(u, v, 0),
    targetMap: (u, v) => torusPoint(u, v, 2.8),
    color,
    targetColor: (u, v) => color(u, v).map((c) => 1 - c),
  };
}
export function checkMorphGeometry(reference) {
  const geometry = sampleSurface(morphOptions(reference.config));
  let maxAbsolute = 0;
  for (const frame of reference.geometryChecks)
    for (let i = 0; i < frame.indices.length; i++)
      for (let k = 0; k < 3; k++) {
        const offset = frame.indices[i] * 4 + k;
        maxAbsolute = Math.max(
          maxAbsolute,
          Math.abs(
            (1 - frame.phase) * geometry.start[offset] +
              frame.phase * geometry.end[offset] -
              frame.points[i][k],
          ),
        );
      }
  if (maxAbsolute > 1e-6) throw new Error(`Morph coordinate mismatch ${maxAbsolute}`);
  return { passed: true, maxAbsolute };
}
export function createMorphCase(config, camera, mode) {
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  document.body.replaceChildren(canvas);
  const start = performance.now();
  const geometry = sampleSurface(morphOptions(config));
  const sampled = performance.now();
  const renderer = createSurfaceRenderer(canvas, {
    ...config,
    camera,
    geometry,
    patchSize: mode === 'gpu32' ? 32 : 8,
  });
  return {
    canvas,
    renderer,
    setup: {
      samplingMs: sampled - start,
      rendererMs: performance.now() - sampled,
      endpointCPUBytes: geometry.cpuBytes,
    },
  };
}
export async function measureMorph(renderer, config, round) {
  // Shared timing harness uses phases in [0,2π); map those to morph alpha [0,1).
  const adapter = Object.create(renderer);
  adapter.draw = (phase, options) => renderer.draw(phase / (2 * Math.PI), options);
  return {
    samples: await benchmarkCase(adapter, config, round),
    sustained: round === 0 ? await sustainedCase(adapter, config) : null,
  };
}
