import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTelemetry } from '../lib/telemetry.mjs';

const localBrowsers = fileURLToPath(new URL('../../vendor/playwright', import.meta.url));
if (existsSync(localBrowsers)) process.env.PLAYWRIGHT_BROWSERS_PATH ??= localBrowsers;
const { openBrowser } = await import('../lib/browser.mjs');

await mkdir('results', { recursive: true });
const experimentalWebGPU = process.argv.includes('--experimental-webgpu');
for (const engine of ['chromium', 'firefox']) {
  const telemetry = await startTelemetry(`compatibility-${engine}`);
  let session, result;
  try {
    session = await openBrowser({
      engine,
      headed: process.argv.includes('--headed'),
      experimentalWebGPU,
      systemFirefox: process.argv.includes('--system-firefox'),
    });
    const errors = [];
    session.page.on('pageerror', (error) => errors.push(String(error)));
    result = await session.page.evaluate(async () =>
      (await import('/experiments/representation/browser-suite.js')).checkBrowser(),
    );
    // Exercise the actual single-file distribution in an ordinary HTML page.
    await session.page.goto('https://manim-js.test/examples/standalone.html');
    await session.page.waitForFunction(
      () =>
        !document.querySelector('#play').disabled ||
        /error|unavailable/i.test(document.querySelector('#status').textContent),
    );
    const ready = await session.page.locator('#play').isEnabled();
    if (!ready) throw new Error(await session.page.locator('#status').textContent());
    await session.page.locator('#play').click();
    const visibility = await session.page.evaluate(() => document.visibilityState);
    const foreground =
      !session.placement || session.placement.activeWorkspace === session.placement.workspace;
    let animationFrames = 'skipped: background workspace; do not change user focus';
    if (foreground && visibility === 'visible')
      animationFrames = await session.page.evaluate(
        () =>
          new Promise((resolve) => {
            let count = 0,
              id;
            const timer = setTimeout(() => {
              cancelAnimationFrame(id);
              resolve('skipped: compositor stopped delivering frames');
            }, 2000);
            const frame = () => {
              if (++count === 8) {
                clearTimeout(timer);
                resolve('passed');
              } else id = requestAnimationFrame(frame);
            };
            id = requestAnimationFrame(frame);
          }),
      );
    await session.page.locator('#pause').click();
    result.standalone = {
      status: 'passed',
      checks: [
        'classic-script load',
        'grid initialization',
        'play/pause controls',
        ...(animationFrames === 'passed' ? ['animation frames'] : []),
      ],
      visibility,
      animationFrames,
    };
    result.engine = engine;
    result.browserVersion = session.browser.version();
    result.launchArgs = session.args;
    result.preferences = session.preferences;
    result.experimentalWebGPU = experimentalWebGPU;
    result.automation = session.automation;
    result.windowPlacement = session.placement;
    result.pageErrors = errors;
    if (errors.length) result.status = 'failed';
  } catch (error) {
    result = {
      ...result,
      engine,
      status: session ? 'failed' : 'blocked',
      createdAt: new Date().toISOString(),
      error: String(error.stack ?? error),
      note: 'No compatibility pass or browser timing inferred from native execution.',
    };
  } finally {
    await session?.browser.close();
  }
  await writeFile(
    `results/compatibility-${engine}${experimentalWebGPU ? '-experimental' : ''}.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
  await telemetry.stop({ status: result.status, engine });
  console.log(`${engine}: ${result.status}`);
  if (result.status !== 'passed') process.exitCode = 1;
}
