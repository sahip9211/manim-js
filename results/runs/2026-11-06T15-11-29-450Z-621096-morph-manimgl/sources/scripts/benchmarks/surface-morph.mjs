import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { openBrowser } from '../lib/browser.mjs';
import { startTelemetry } from '../lib/telemetry.mjs';
import { processMemorySnapshot } from '../lib/process-memory.mjs';
import { snapshotSources } from '../lib/source-snapshot.mjs';
const exec = promisify(execFile),
  python = process.env.MANIM_JS_PYTHON ?? 'vendor/manimgl-venv/bin/python';
const sources = [
  'scripts/benchmarks/surface-morph.mjs',
  'experiments/parity/reference.py',
  'experiments/parity/workload.json',
  'experiments/parity/requirements.txt',
  'experiments/parity/compare.py',
  'experiments/parity/morph-suite.js',
  'experiments/parity/browser-suite.js',
  'src/surface/model.js',
  'src/surface/sample.js',
  'src/surface/shaders.js',
  'src/surface/webgl2.js',
  'src/surface/playback.js',
  'src/experimental-parametric-surface.js',
  'scripts/lib/browser.mjs',
  'scripts/lib/firefox-bidi.mjs',
  'scripts/lib/test-workspace.mjs',
  'scripts/lib/telemetry.mjs',
  'scripts/lib/drm-stats.mjs',
  'scripts/lib/process-memory.mjs',
  'package-lock.json',
];
const native = await startTelemetry('morph-manimgl'),
  referenceDirectory = native.directory;
let reference;
try {
  const sourceHashes = await snapshotSources(referenceDirectory, sources);
  const output = await exec(
    python,
    ['experiments/parity/reference.py', '--morph', '--output', referenceDirectory],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  reference = JSON.parse(await readFile(`${referenceDirectory}/result.json`));
  reference.sourceHashes = sourceHashes;
  reference.upstreamRevision = (
    await exec('git', ['-C', 'vendor/manimgl', 'rev-parse', 'HEAD'])
  ).stdout.trim();
  reference.console = (output.stdout + output.stderr).replaceAll(
    process.cwd(),
    '/workspace/manim-js',
  );
} catch (error) {
  reference = {
    status: 'failed',
    error: String(error).replaceAll(process.cwd(), '/workspace/manim-js'),
  };
  process.exitCode = 1;
} finally {
  await writeFile(`${referenceDirectory}/result.json`, JSON.stringify(reference, null, 2) + '\n');
  await native.stop({ status: reference.status });
  console.log('ManimGL', reference.status, referenceDirectory);
}
if (reference.status !== 'complete')
  throw new Error(reference.error ?? 'Native morph reference failed');
for (const engine of ['chromium', 'firefox']) {
  const telemetry = await startTelemetry(`morph-${engine}`);
  const result = {
    experiment: '012-surface-morph',
    engine,
    status: 'running',
    referenceDirectory,
    config: reference.config,
    cases: [],
    errors: [],
  };
  let session;
  try {
    result.sourceHashes = await snapshotSources(telemetry.directory, sources);
    session = await openBrowser({ engine, headed: true, systemFirefox: true });
    session.page.on('pageerror', (e) => result.errors.push(String(e)));
    result.browserVersion = session.browser.version();
    result.windowPlacement = session.placement;
    result.blankMemory = processMemorySnapshot();
    result.geometry = await session.page.evaluate(
      async (r) => (await import('/experiments/parity/morph-suite.js')).checkMorphGeometry(r),
      reference,
    );
    for (let round = 0; round < reference.config.rounds; round++)
      for (const mode of round % 2 ? ['gpu32', 'gpu8'] : ['gpu8', 'gpu32']) {
        const row = await session.page.evaluate(
          async ({ config, camera, mode, round }) => {
            const suite = await import('/experiments/parity/morph-suite.js');
            globalThis.morphCase = suite.createMorphCase(config, camera, mode);
            const { renderer, setup } = morphCase;
            for (let i = 0; i < 48; i++) renderer.draw(i / 48, { present: false });
            renderer.finish();
            return {
              mode,
              round,
              metadata: renderer.metadata,
              setup,
              ...(await suite.measureMorph(renderer, config, round)),
            };
          },
          { config: reference.config, camera: reference.camera, mode, round },
        );
        row.memory = processMemorySnapshot();
        result.cases.push(row);
        if (round === 0)
          for (let i = 0; i < reference.config.validationPhases.length; i++) {
            const png = await session.page.evaluate((alpha) => {
              morphCase.renderer.draw(alpha);
              return morphCase.canvas.toDataURL('image/png').split(',')[1];
            }, reference.config.validationPhases[i]);
            await writeFile(`${telemetry.directory}/${mode}-${i}.png`, Buffer.from(png, 'base64'));
          }
        await session.page.evaluate(() => {
          morphCase.renderer.dispose({ releaseContext: true });
          morphCase.canvas.remove();
          delete globalThis.morphCase;
        });
        console.log(engine, mode, round, row.samples.map((x) => x.drainedMs.toFixed(3)).join(','));
      }
    result.status = result.errors.length ? 'failed' : 'complete';
    await writeFile(`${telemetry.directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
    await exec(python, ['experiments/parity/compare.py', telemetry.directory]);
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
