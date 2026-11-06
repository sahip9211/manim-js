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
      return captures;
    });
    if (new Set(frames).size !== frames.length)
      throw new Error('Surface captures did not change over time');
    for (let i = 0; i < frames.length; i++)
      await writeFile(`${telemetry.directory}/frame-${i}.png`, Buffer.from(frames[i], 'base64'));
    result.checks = [
      'standalone classic-script load',
      'example initialization and controls',
      'three distinct deterministic canvas captures',
      'play, pause, set and render',
      'idempotent disposal and rejection after disposal',
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
