import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { openBrowser } from '../lib/browser.mjs';
import { startTelemetry } from '../lib/telemetry.mjs';
import { snapshotSources } from '../lib/source-snapshot.mjs';
import { processMemorySnapshot } from '../lib/process-memory.mjs';
const exec = promisify(execFile);
const quick = process.argv.includes('--quick'),
  rounds = quick ? 1 : 2;
const selected = process.argv.find((x) => x.startsWith('--browser='))?.slice(10) ?? 'both';
const engines = selected === 'both' ? ['chromium', 'firefox'] : [selected];
const variants = (
  process.argv.find((x) => x.startsWith('--variants='))?.slice(11) ?? 'frozen-010,instanced,canvas'
).split(',');
if (variants.some((x) => !['frozen-010', 'instanced', 'canvas'].includes(x)))
  throw new Error('Invalid variant');
if (engines.some((x) => !['chromium', 'firefox'].includes(x))) throw new Error('Invalid browser');
const referenceDirectory = 'results/runs/2026-11-06T13-43-34-404Z-474649-parity-manimgl';
const reference = JSON.parse(await readFile(`${referenceDirectory}/result.json`));
const config = { ...reference.config, rounds: quick ? 1 : 3 };
const baseline = JSON.parse(await readFile('experiments/baselines/surface-010.json'));
if (
  createHash('sha256')
    .update(await readFile(baseline.file))
    .digest('hex') !== baseline.sha256
)
  throw new Error('Frozen baseline hash mismatch');
for (let round = 0; round < rounds; round++)
  for (const engine of engines)
    for (const variant of round % 2 ? [...variants].reverse() : variants) {
      const telemetry = await startTelemetry(`memory-${engine}-${variant}`);
      const result = {
        experiment: '010-surface-memory',
        status: 'running',
        engine,
        variant,
        round,
        baseline,
        referenceDirectory,
        config,
        checkpoints: [],
        cases: [],
        errors: [],
      };
      let session;
      const checkpoint = async (name) => {
        const samples = [];
        for (let i = 0; i < 3; i++) {
          samples.push(processMemorySnapshot());
          await delay(150);
        }
        const heap = await session.page.evaluate(() =>
          performance.memory
            ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
            : null,
        );
        result.checkpoints.push({ name, samples, browserHeap: heap });
      };
      try {
        result.sourceHashes = await snapshotSources(telemetry.directory, [
          'scripts/benchmarks/memory.mjs',
          'scripts/lib/process-memory.mjs',
          'scripts/lib/telemetry.mjs',
          'scripts/lib/drm-stats.mjs',
          'scripts/lib/browser.mjs',
          'scripts/lib/firefox-bidi.mjs',
          'scripts/lib/test-workspace.mjs',
          'experiments/baselines/surface-010.js',
          'experiments/baselines/surface-010.json',
          'experiments/parity/browser-suite.js',
          'experiments/parity/compare.py',
          'src/surface/model.js',
          'src/surface/shaders.js',
          'src/surface/webgl2.js',
          'package-lock.json',
        ]);
        session = await openBrowser({ engine, headed: true, systemFirefox: true });
        result.windowPlacement = session.placement;
        result.browserVersion = session.browser.version();
        session.page.on('pageerror', (e) => result.errors.push(String(e)));
        await session.page.goto('https://manim-js.test/lab/index.html?bench');
        await delay(1500);
        await checkpoint('blank-browser');
        result.metadata = await session.page.evaluate(
          async ({ variant, config, camera }) => {
            const module = await import(
              variant === 'frozen-010'
                ? '/experiments/baselines/surface-010.js'
                : '/src/surface/webgl2.js'
            );
            globalThis.makeMemoryRenderer = () => {
              const c = document.createElement('canvas');
              c.width = config.width;
              c.height = config.height;
              document.body.replaceChildren(c);
              const r = module.createSurfaceRenderer(c, {
                ...config,
                camera,
                mode: variant === 'frozen-010' ? 'tiled' : 'instanced',
                renderTarget: variant === 'canvas' ? 'canvas' : 'offscreen',
              });
              return { canvas: c, renderer: r };
            };
            globalThis.memoryCase = makeMemoryRenderer();
            for (let i = 0; i < 48; i++)
              memoryCase.renderer.draw((2 * Math.PI * i) / 48, { present: false });
            memoryCase.renderer.finish();
            return {
              ...memoryCase.renderer.metadata,
              contextAttributes: memoryCase.renderer.gl.getContextAttributes(),
            };
          },
          { variant, config, camera: reference.camera },
        );
        await checkpoint('scene-before-capture');
        const measurement = await session.page.evaluate(async (config) => {
          const { benchmarkCase, sustainedCase } = await import(
            '/experiments/parity/browser-suite.js'
          );
          const r = memoryCase.renderer;
          const samples = [];
          for (let i = 0; i < config.rounds; i++)
            samples.push(...(await benchmarkCase(r, config, i)));
          return { samples, sustained: await sustainedCase(r, config) };
        }, config);
        result.cases.push({ ...result.metadata, mode: variant, ...measurement });
        await checkpoint('scene-after-rendering');
        // Encode PNG in the browser: do not serialize full RGBA buffers through automation.
        for (let i = 0; i < config.validationPhases.length; i++) {
          const png = await session.page.evaluate((phase) => {
            memoryCase.renderer.draw(phase);
            return memoryCase.canvas.toDataURL('image/png').split(',')[1];
          }, config.validationPhases[i]);
          await writeFile(`${telemetry.directory}/${variant}-${i}.png`, Buffer.from(png, 'base64'));
        }
        await checkpoint('scene-after-png-capture');
        await session.page.evaluate(() => {
          memoryCase.renderer.dispose({ releaseContext: true });
          memoryCase.canvas.remove();
          delete globalThis.memoryCase;
        });
        await delay(1500);
        await checkpoint('disposed');
        for (let i = 0; i < 12; i++) {
          await session.page.evaluate(() => {
            const c = makeMemoryRenderer();
            for (const p of [0, 0.7, 1.9]) c.renderer.draw(p, { present: false });
            c.renderer.finish();
            c.renderer.dispose({ releaseContext: true });
            c.canvas.remove();
          });
          if (i === 3 || i === 7 || i === 11) {
            await delay(500);
            await checkpoint(`disposed-after-${i + 1}-cycles`);
          }
        }
        result.status = result.errors.length ? 'failed' : 'complete';
        await writeFile(
          `${telemetry.directory}/result.json`,
          JSON.stringify(result, null, 2) + '\n',
        );
        await exec(process.env.MANIM_JS_PYTHON ?? 'vendor/manimgl-venv/bin/python', [
          'experiments/parity/compare.py',
          telemetry.directory,
        ]);
        result.parity = JSON.parse(await readFile(`${telemetry.directory}/parity.json`));
      } catch (error) {
        result.status = 'failed';
        result.error = String(error.stack ?? error).replaceAll(
          process.cwd(),
          '/workspace/manim-js',
        );
        process.exitCode = 1;
      } finally {
        await session?.browser.close();
        await writeFile(
          `${telemetry.directory}/result.json`,
          JSON.stringify(result, null, 2) + '\n',
        );
        await telemetry.stop({ status: result.status });
        console.log(engine, variant, round, result.status, telemetry.directory);
      }
    }
