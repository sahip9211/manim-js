import { makeRepresentation } from './model.js';
import { createWebGL2Renderer } from './webgl2.js';
import { createRepresentationRenderer } from './webgpu.js';
import { compareCoverage } from './validation.js';

// Compatibility and image correctness only. No FPS claims from this smoke test.
export async function checkBrowser(onProgress = () => {}) {
  const report = {
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    secureContext: isSecureContext,
    isolated: crossOriginIsolated,
    backends: [],
    status: 'running',
  };
  let webglReference;
  for (const backend of ['webgl2', 'webgpu']) {
    const entry = { backend, status: 'running', cases: [] };
    report.backends.push(entry);
    let device, canvas;
    try {
      if (backend === 'webgpu') {
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) {
          entry.status = 'unavailable';
          entry.reason = 'No WebGPU adapter with current browser defaults';
          continue;
        }
        const info = adapter.info;
        entry.adapter = info
          ? {
              vendor: info.vendor,
              architecture: info.architecture,
              description: info.description,
              isFallbackAdapter: info.isFallbackAdapter,
            }
          : null;
        device = await adapter.requestDevice();
      } else {
        canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        if (
          !canvas.getContext('webgl2', {
            antialias: false,
            alpha: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: true,
          })
        ) {
          entry.status = 'unavailable';
          entry.reason = 'No WebGL2 context';
          continue;
        }
      }
      const errors = [];
      device?.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
      for (const phase of [0, 0.8, 2.4]) {
        let reference;
        for (const mode of ['expanded', 'instanced', 'bounded']) {
          const model = makeRepresentation(33, mode);
          const renderer =
            backend === 'webgpu'
              ? await createRepresentationRenderer(device, model)
              : createWebGL2Renderer(canvas, model);
          try {
            renderer.draw(phase, phase === 2.4 ? -0.25 : 0.25);
            const pixels = await renderer.readPixels();
            reference ??= pixels;
            const coverage = compareCoverage(reference, pixels, 640, 480);
            entry.cases.push({ phase, mode, coverage, metadata: renderer.metadata });
            if (!coverage.passed) throw new Error(`Coverage mismatch ${phase}/${mode}`);
            if (phase === 0.8 && mode === 'expanded') {
              if (backend === 'webgl2') webglReference = pixels;
              else if (webglReference) {
                entry.crossBackendCoverage = compareCoverage(webglReference, pixels, 640, 480);
                if (!entry.crossBackendCoverage.passed)
                  throw new Error('Cross-backend coverage mismatch');
              }
            }
          } finally {
            renderer.dispose();
          }
        }
      }
      if (errors.length) throw new Error(errors.join('\n'));
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = String(error.stack ?? error);
    } finally {
      device?.destroy();
      canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      onProgress(entry);
    }
  }
  report.status = report.backends.every((x) => x.status === 'passed')
    ? 'passed'
    : report.backends.some((x) => x.status === 'failed')
      ? 'failed'
      : 'partial';
  return report;
}
