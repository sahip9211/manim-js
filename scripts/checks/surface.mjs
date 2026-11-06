import { writeFile, readFile } from 'node:fs/promises';
import { openBrowser } from '../lib/browser.mjs';
import { startTelemetry } from '../lib/telemetry.mjs';

for (const engine of ['chromium', 'firefox']) {
  const telemetry = await startTelemetry(`surface-bundle-${engine}`);
  let session;
  const result = { engine, status: 'running', checks: [], errors: [] };
  try {
    session = await openBrowser({ engine, headed: true, systemFirefox: true });
    session.page.on('pageerror', (e) => result.errors.push(String(e)));
    await session.page.goto('https://manim-js.test/examples/wave-torus.html');
    await session.page.waitForFunction(
      () => document.querySelector('#status').textContent !== 'Loading…',
    );
    const enabled = await session.page.locator('#play').isEnabled();
    if (!enabled) throw new Error('Surface example failed to initialize');
    await session.page.locator('#pause').click();
    const frames = await session.page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      document.body.replaceChildren(canvas);
      const scene = await ManimJS.experimental.createWaveTorus(canvas);
      if (scene.metadata.indexBytes !== 768) throw new Error('Instanced default not active');
      const captures = [];
      for (const phase of [0, 0.7, 3.4]) {
        scene.render(phase);
        captures.push(canvas.toDataURL('image/png').split(',')[1]);
      }
      scene.play();
      scene.pause();
      scene.set({ phase: 1 });
      scene.render();
      scene.dispose();
      scene.dispose();
      let rejectsDisposed = false;
      try {
        scene.render();
      } catch {
        rejectsDisposed = true;
      }
      if (!rejectsDisposed) throw new Error('Disposed surface rendered');
      let rejectsMissingDepth = false;
      try {
        await ManimJS.experimental.createWaveTorus(canvas, { renderTarget: 'canvas' });
      } catch {
        rejectsMissingDepth = true;
      }
      if (!rejectsMissingDepth)
        throw new Error('Reused depthless canvas accepted a depth-dependent target');
      const reused = await ManimJS.experimental.createWaveTorus(canvas);
      reused.render(0.7);
      reused.dispose({ releaseContext: true });
      if (!canvas.getContext('webgl2').isContextLost())
        throw new Error('Terminal disposal did not release context');
      return captures;
    });
    if (new Set(frames).size !== frames.length)
      throw new Error('Surface captures did not change over time');
    for (let i = 0; i < frames.length; i++)
      await writeFile(`${telemetry.directory}/frame-${i}.png`, Buffer.from(frames[i], 'base64'));
    result.partialMeshes = await session.page.evaluate(async () => {
      const { createSurfaceRenderer } = await import('/src/surface/webgl2.js');
      const { createSurfaceRenderer: baseline } = await import(
        '/experiments/baselines/surface-010.js'
      );
      const checks = [];
      for (const [uSegments, vSegments] of [
        [3, 3],
        [19, 17],
        [32, 16],
      ]) {
        const makeCanvas = () => {
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 180;
          return c;
        };
        const reference = baseline(makeCanvas(), { uSegments, vSegments, mode: 'tiled' });
        for (const renderTarget of ['offscreen', 'canvas']) {
          const candidate = createSurfaceRenderer(makeCanvas(), {
            uSegments,
            vSegments,
            renderTarget,
          });
          let maxError = 0;
          for (const phase of [0, 0.7, 3.4]) {
            reference.draw(phase);
            candidate.draw(phase);
            reference.finish();
            candidate.finish();
            const a = reference.read(),
              b = candidate.read();
            if (!a.some((v, i) => i % 4 !== 3 && v > 0)) throw new Error('Empty reference');
            for (let i = 0; i < a.length; i++) maxError = Math.max(maxError, Math.abs(a[i] - b[i]));
          }
          candidate.dispose({ releaseContext: true });
          if (maxError > 1)
            throw new Error(
              `Partial mesh mismatch: ${uSegments}x${vSegments}, ${renderTarget}, ${maxError}`,
            );
          checks.push({ uSegments, vSegments, renderTarget, maxError });
        }
        reference.dispose();
        reference.gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      return checks;
    });
    result.checks = [
      'standalone classic-script load',
      'example initialization and controls',
      'three distinct deterministic canvas captures',
      'play, pause, set and render',
      'idempotent disposal and rejection after disposal',
      'canvas context reuse, incompatible target rejection and terminal context release',
      'partial instanced meshes match frozen renderer in both targets',
    ];
    result.bundleManifest = JSON.parse(await readFile('dist/manifest.json'));
    result.windowPlacement = session.placement;
    result.browserVersion = session.browser.version();
    result.status = result.errors.length ? 'failed' : 'passed';
  } catch (error) {
    result.status = 'failed';
    result.error = String(error).replaceAll(process.cwd(), '/workspace/manim-js');
    process.exitCode = 1;
  } finally {
    await session?.browser.close();
    await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
    await telemetry.stop({ status: result.status });
    console.log(engine, result.status, telemetry.directory);
  }
}
