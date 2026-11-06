import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { openBrowser } from '../lib/browser.mjs';
import { startTelemetry } from '../lib/telemetry.mjs';
import { snapshotSources } from '../lib/source-snapshot.mjs';
import { processMemorySnapshot } from '../lib/process-memory.mjs';
const exec = promisify(execFile);
const referenceDirectory = 'results/runs/2026-11-06T13-43-34-404Z-474649-parity-manimgl';
const reference = JSON.parse(await readFile(`${referenceDirectory}/result.json`));
const baseline = JSON.parse(await readFile('experiments/baselines/surface-011.json'));
if (
  createHash('sha256')
    .update(await readFile(baseline.file))
    .digest('hex') !== baseline.sha256
)
  throw new Error('Baseline hash mismatch');
const config = {
  ...reference.config,
  rounds: 4,
  frames: Number(
    process.argv.find((x) => x.startsWith('--frames='))?.slice(9) ?? reference.config.frames,
  ),
  batchSize: Number(
    process.argv.find((x) => x.startsWith('--batch-size='))?.slice(13) ??
      reference.config.batchSize,
  ),
};
if (
  !Number.isInteger(config.frames) ||
  !Number.isInteger(config.batchSize) ||
  config.batchSize < 1 ||
  config.frames < config.batchSize ||
  config.frames % config.batchSize
)
  throw new Error('Invalid timing batch');
const variants = (
  process.argv.find((x) => x.startsWith('--variants='))?.slice(11) ??
  'frozen-011,patch16,patch32,patch64,tiled'
).split(',');
if (
  variants.some(
    (v) =>
      !['frozen-011', 'patch16', 'patch32', 'patch64', 'tiled', 'factored8', 'factored32'].includes(
        v,
      ),
  )
)
  throw new Error('Invalid variant');
for (const engine of ['chromium', 'firefox']) {
  const telemetry = await startTelemetry(`patches-${engine}`);
  const result = {
    experiment: '011-surface-patches',
    status: 'running',
    engine,
    baseline,
    referenceDirectory,
    config,
    cases: [],
    errors: [],
  };
  let session;
  try {
    result.sourceHashes = await snapshotSources(telemetry.directory, [
      'scripts/benchmarks/surface-patches.mjs',
      'experiments/baselines/surface-011.js',
      'experiments/baselines/surface-011.json',
      'src/surface/webgl2.js',
      'src/surface/shaders.js',
      'src/surface/model.js',
      'experiments/parity/browser-suite.js',
      'experiments/parity/compare.py',
      'scripts/lib/process-memory.mjs',
      'scripts/lib/telemetry.mjs',
      'scripts/lib/drm-stats.mjs',
      'scripts/lib/browser.mjs',
      'scripts/lib/firefox-bidi.mjs',
      'scripts/lib/test-workspace.mjs',
      'package-lock.json',
    ]);
    session = await openBrowser({ engine, headed: true, systemFirefox: true });
    session.page.on('pageerror', (e) => result.errors.push(String(e)));
    result.browserVersion = session.browser.version();
    result.windowPlacement = session.placement;
    result.blankMemory = processMemorySnapshot();
    for (let round = 0; round < config.rounds; round++) {
      const order = round % 2 ? [...variants].reverse() : variants;
      for (const mode of order) {
        const row = await session.page.evaluate(
          async ({ mode, config, camera, round }) => {
            const module = await import(
              mode === 'frozen-011'
                ? '/experiments/baselines/surface-011.js'
                : '/src/surface/webgl2.js'
            );
            const { benchmarkCase, sustainedCase } = await import(
              '/experiments/parity/browser-suite.js'
            );
            const canvas = document.createElement('canvas');
            canvas.width = config.width;
            canvas.height = config.height;
            document.body.replaceChildren(canvas);
            const setupStart = performance.now();
            const renderer = module.createSurfaceRenderer(canvas, {
              ...config,
              camera,
              mode: mode === 'tiled' ? 'tiled' : 'instanced',
              patchSize: mode.startsWith('patch')
                ? Number(mode.slice(5))
                : mode === 'factored32'
                  ? 32
                  : 8,
              normalMode: mode.startsWith('factored') ? 'factored' : 'difference',
            });
            const setupMs = performance.now() - setupStart;
            globalThis.patchCase = { renderer, canvas };
            for (let i = 0; i < 48; i++) renderer.draw(i / 8, { present: false });
            renderer.finish();
            const samples = await benchmarkCase(renderer, config, round);
            return {
              mode,
              round,
              metadata: renderer.metadata,
              setupMs,
              samples,
              sustained: round === 0 ? await sustainedCase(renderer, config) : null,
            };
          },
          { mode, config, camera: reference.camera, round },
        );
        row.memory = processMemorySnapshot();
        result.cases.push(row);
        if (round === 0)
          for (let i = 0; i < config.validationPhases.length; i++) {
            const png = await session.page.evaluate((phase) => {
              patchCase.renderer.draw(phase);
              return patchCase.canvas.toDataURL('image/png').split(',')[1];
            }, config.validationPhases[i]);
            await writeFile(`${telemetry.directory}/${mode}-${i}.png`, Buffer.from(png, 'base64'));
          }
        await session.page.evaluate(() => {
          patchCase.renderer.dispose({ releaseContext: true });
          patchCase.canvas.remove();
          delete globalThis.patchCase;
        });
        console.log(engine, mode, round, row.samples.map((s) => s.drainedMs.toFixed(3)).join(','));
      }
    }
    result.status = result.errors.length ? 'failed' : 'complete';
    await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
    await exec(process.env.MANIM_JS_PYTHON ?? 'vendor/manimgl-venv/bin/python', [
      'experiments/parity/compare.py',
      telemetry.directory,
    ]);
    result.parity = JSON.parse(await readFile(`${telemetry.directory}/parity.json`));
  } catch (error) {
    result.status = 'failed';
    result.error = String(error.stack ?? error).replaceAll(process.cwd(), '/workspace/manim-js');
    process.exitCode = 1;
  } finally {
    await session?.browser.close();
    await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
    await telemetry.stop({ status: result.status });
    console.log(engine, result.status, telemetry.directory);
  }
}
