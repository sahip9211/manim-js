import { createSurfaceRenderer } from '../../src/surface/webgl2.js';
import { torusPoint } from '../../src/surface/model.js';

export function checkGeometry(reference) {
  let maxAbsolute = 0;
  const nv = reference.config.vSegments + 1;
  for (const check of reference.geometryChecks)
    for (let i = 0; i < check.indices.length; i++) {
      const id = check.indices[i];
      const point = torusPoint(
        (2 * Math.PI * Math.floor(id / nv)) / reference.config.uSegments,
        (2 * Math.PI * (id % nv)) / reference.config.vSegments,
        check.phase,
      );
      for (let k = 0; k < 3; k++)
        maxAbsolute = Math.max(maxAbsolute, Math.abs(point[k] - check.points[i][k]));
    }
  if (maxAbsolute > 1e-6) throw new Error(`Coordinate oracle mismatch: ${maxAbsolute}`);
  return {
    passed: true,
    maxAbsolute,
    samples: reference.geometryChecks.length * reference.geometryChecks[0].indices.length,
  };
}

export function createCase(config, camera, mode) {
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  document.body.replaceChildren(canvas);
  document.body.style.margin = '0';
  const renderer = createSurfaceRenderer(canvas, { ...config, camera, mode });
  return { renderer, canvas };
}

export async function benchmarkCase(renderer, config, round) {
  const samples = [];
  for (const phase of [0, 0.3, 0.6]) renderer.draw(phase, { present: false });
  renderer.finish();
  for (let start = 0; start < config.frames; start += config.batchSize) {
    const queries = Array.from({ length: config.batchSize }, () => renderer.createQuery());
    const submissions = [],
      began = performance.now();
    for (let i = 0; i < config.batchSize; i++) {
      const t = performance.now();
      renderer.draw((2 * Math.PI * (start + i)) / config.frames, {
        present: false,
        query: queries[i],
      });
      submissions.push(performance.now() - t);
    }
    renderer.finish();
    const drainedMs = (performance.now() - began) / config.batchSize;
    // WebGL query availability advances only after yielding to the browser.
    await new Promise((resolve) => setTimeout(resolve, 0));
    let gpuMs = queries.map((q) => renderer.readQuery(q));
    if (queries[0]) {
      const deadline = performance.now() + 5000;
      while (gpuMs.some((x) => x === null) && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        gpuMs = queries.map((q) => renderer.readQuery(q));
      }
      if (gpuMs.some((x) => x === null)) throw new Error('GPU query did not become available');
    }
    queries.forEach((q) => renderer.deleteQuery(q));
    samples.push({
      round,
      firstFrame: start,
      drainedMs,
      submissionMs: submissions,
      gpuMs: queries[0] ? gpuMs : null,
    });
  }
  return samples;
}

export function rawBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384)
    text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
}

export async function sustainedCase(renderer, config, durationMs = 3000) {
  const startUnixMs = Date.now(),
    start = performance.now();
  let frames = 0;
  while (performance.now() - start < durationMs) {
    for (let i = 0; i < config.batchSize; i++) {
      renderer.draw((2 * Math.PI * (frames % config.frames)) / config.frames, { present: false });
      frames++;
    }
    renderer.finish();
  }
  return {
    startUnixMs,
    endUnixMs: Date.now(),
    frames,
    elapsedMs: performance.now() - start,
    note: 'Continuous offscreen batches with synchronous readback; throughput is not displayed FPS.',
  };
}
