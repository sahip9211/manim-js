// Minimal test-only adapter for installed Firefox. No driver download or runtime
// dependency. Protocol: https://developer.mozilla.org/en-US/docs/Web/WebDriver/How_to/Create_BiDi_connection
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { serve } from './serve.mjs';
import { prepareTestWorkspace, inspectTestWorkspace, testWindowClass } from './test-workspace.mjs';

export async function openSystemFirefox({ headed = false, experimentalWebGPU = false } = {}) {
  const placement = await prepareTestWorkspace(headed);
  const profile = await mkdtemp(join(tmpdir(), 'lean-js-firefox-'));
  const preferences = experimentalWebGPU ? { 'dom.webgpu.enabled': true } : {};
  await writeFile(join(profile, 'user.js'), Object.entries(preferences).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));
  const args = ['--no-remote', '--profile', profile, '--remote-debugging-port', '0', ...(!headed ? ['--headless'] : []), 'about:blank'];
  if (placement) args.unshift(`--class=${testWindowClass}`, `--name=${testWindowClass}`);
  let child, socket, local, closed = false, nextID = 0, output = '';
  const pending = new Map(), errorListeners = [];
  const failPending = error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); };
  const close = async () => {
    if (closed) return; closed = true;
    socket?.close(); failPending(new Error('Firefox session closed'));
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      for (let i = 0; i < 30 && child.exitCode === null; i++) await sleep(100);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    if (local) await new Promise(resolve => local.server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  };
  try {
    local = await serve();
    child = spawn(process.env.FIREFOX_PATH ?? '/usr/bin/firefox', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(placement ? { MOZ_APP_REMOTINGNAME: testWindowClass } : {}) } });
    let launchError;
    child.on('error', error => { launchError = error; });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-32768); });
    let endpoint;
    for (let i = 0; i < 300; i++) {
      if (launchError) throw launchError;
      endpoint = output.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/)?.[1];
      if (endpoint) break;
      if (child.exitCode !== null) throw new Error(`Firefox exited: ${output}`);
      await sleep(100);
    }
    if (!endpoint) throw new Error(`Firefox BiDi startup timed out: ${output}`);
    socket = new WebSocket(endpoint.endsWith('/session') ? endpoint : endpoint + '/session');
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = pending.get(message.id); if (!entry) return;
        pending.delete(message.id); clearTimeout(entry.timer);
        if (message.type === 'error') entry.reject(new Error(`${message.error}: ${message.message}`)); else entry.resolve(message.result);
      } else if (message.method === 'log.entryAdded' && message.params.type === 'javascript' && message.params.level === 'error') {
        for (const callback of errorListeners) callback(message.params.text);
      }
    });
    socket.addEventListener('close', () => failPending(new Error('Firefox BiDi disconnected')));
    function command(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++nextID;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`BiDi timeout: ${method}`)); }, method === 'script.evaluate' ? 600000 : 30000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
      });
    }
    const session = await command('session.new', { capabilities: {} });
    // Reuse the isolated profile's initial about:blank tab. Creating a foreground
    // tab can wait indefinitely for focus while workspace rules suppress it.
    const tree = await command('browsingContext.getTree', { maxDepth: 0 });
    const { context } = tree.contexts[0] ?? await command('browsingContext.create', { type: 'tab', background: true });
    await command('session.subscribe', { events: ['log.entryAdded'], contexts: [context] });
    await command('browsingContext.setViewport', { context, viewport: { width: 1100, height: 900 }, devicePixelRatio: 1 });
    const page = {
      async evaluate(fn, arg) {
        const result = await command('script.evaluate', {
          expression: `(async () => JSON.stringify(await (${fn.toString()})(${JSON.stringify(arg) ?? 'undefined'})))()`,
          target: { context }, awaitPromise: true,
        });
        if (result.type === 'exception') throw new Error(result.exceptionDetails.text);
        return result.result.type === 'undefined' ? undefined : JSON.parse(result.result.value);
      },
      goto(url) { return command('browsingContext.navigate', { context, url: url.replace('https://lean-js.test', local.url), wait: 'complete' }); },
      on(event, callback) { if (event === 'pageerror') errorListeners.push(callback); },
      async waitForFunction(fn) {
        const end = Date.now() + 30000;
        do { if (await page.evaluate(fn)) return; await sleep(100); } while (Date.now() < end);
        throw new Error('Firefox page predicate timed out');
      },
      locator(selector) {
        return {
          isEnabled: () => page.evaluate(s => !document.querySelector(s).disabled, selector),
          textContent: () => page.evaluate(s => document.querySelector(s).textContent, selector),
          click: () => page.evaluate(s => document.querySelector(s).click(), selector),
        };
      },
    };
    await page.goto('https://lean-js.test/lab/index.html?bench');
    return { browser: { close, version: () => session.capabilities.browserVersion }, page, args, preferences, experimentalWebGPU, automation: 'system Firefox / WebDriver BiDi', placement: await inspectTestWorkspace(placement) };
  } catch (error) { await close(); throw error; }
}
