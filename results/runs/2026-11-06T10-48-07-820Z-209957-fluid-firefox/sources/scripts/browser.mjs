import { chromium, firefox } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

// Serve only repository assets through Playwright's in-process interception.
// No listening socket, external navigation, existing profile, or remote service.
export async function openBrowser({ software = false, headed = false, engine = 'chromium', experimentalWebGPU = false, systemFirefox = false } = {}) {
  if (!['chromium', 'firefox'].includes(engine)) throw new Error(`Unknown browser ${engine}`);
  if (software && engine === 'firefox') throw new Error('Chromium software flags cannot be used with Firefox');
  if (systemFirefox && engine === 'firefox') return (await import('./firefox-bidi.mjs')).openSystemFirefox({ headed, experimentalWebGPU });
  const args = software
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--use-vulkan=swiftshader']
    : [];
  if (experimentalWebGPU && engine === 'chromium') args.push('--enable-unsafe-webgpu', '--ozone-platform=x11', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE');
  const preferences = experimentalWebGPU && engine === 'firefox' ? { 'dom.webgpu.enabled': true } : {};
  const browser = await ({ chromium, firefox })[engine].launch({
    // Firefox must be Playwright's patched build, not the system Firefox binary.
    ...(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' } : process.env.PLAYWRIGHT_FIREFOX_PATH ? { executablePath: process.env.PLAYWRIGHT_FIREFOX_PATH } : {}),
    headless: !headed, args,
    ...(engine === 'firefox' ? { firefoxUserPrefs: preferences } : {}),
  });
  try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const root = fileURLToPath(new URL('../', import.meta.url));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://lean-js.test') return route.abort();
    const filename = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/lab/index.html' : url.pathname));
    if (!filename.startsWith(root.endsWith(sep) ? root : root + sep)) return route.abort();
    try {
      await route.fulfill({ status: 200, body: await readFile(filename), headers: {
        'content-type': types[extname(filename)] ?? 'application/octet-stream',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'require-corp',
      } });
    } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  await page.goto('https://lean-js.test/?bench');
  return { browser, page, args, preferences, experimentalWebGPU, automation: 'Playwright' };
  } catch (error) { await browser.close(); throw error; }
}
