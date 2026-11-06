import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser } from '../lib/browser.mjs';

const software = process.argv.includes('--software');
const headed = process.argv.includes('--headed');
const quick = process.argv.includes('--quick');
const filename = software ? 'results/browser-software.json' : 'results/browser-hardware.json';
await mkdir('results', { recursive: true });
let session;
try {
  session = await openBrowser({ software, headed });
  const browserErrors = [];
  session.page.on('pageerror', (e) => browserErrors.push(String(e)));
  await session.page.exposeFunction('reportProgress', (result) =>
    console.log(
      `round ${result.round + 1} n=${result.size} ${result.strategy}: ${result.drainedBatchMsPerFrame.median.toFixed(3)} ms/drained frame`,
    ),
  );
  const result = await session.page.evaluate(
    async ({ software, quick }) => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter. No timings were collected.');
      if (adapter.info.isFallbackAdapter && !software)
        throw new Error(
          'Refusing to label a software adapter as hardware. Run explicitly with --software for software measurements.',
        );
      const device = await adapter.requestDevice({
        requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [],
      });
      const metadata = {
        experiment: '001-grid-deformation',
        createdAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        isolated: crossOriginIsolated,
        logicalCpus: navigator.hardwareConcurrency,
        adapter: {
          vendor: adapter.info.vendor,
          architecture: adapter.info.architecture,
          device: adapter.info.device,
          description: adapter.info.description,
          isFallbackAdapter: adapter.info.isFallbackAdapter,
        },
        features: [...adapter.features],
        visibility: document.visibilityState,
      };
      const errors = [];
      device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
      try {
        const { validateRenderers, runSuite } = await import('/experiments/grid/suite.js');
        const validation = await validateRenderers(device);
        const suite = await runSuite(device, {
          ...(quick
            ? { sizes: [32], rounds: 1, batchFrames: 4, measuredBatches: 2, warmupFrames: 8 }
            : {}),
          onResult: (result) => window.reportProgress(result),
        });
        // A separate visible-canvas experiment records rAF pacing, not throughput.
        const { createGridRenderer } = await import('/experiments/grid/webgpu.js');
        const { makeGrid, summarize } = await import('/experiments/grid/model.js');
        const canvas = document.querySelector('#view');
        const context = canvas.getContext('webgpu');
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: 'opaque' });
        const renderer = await createGridRenderer(device, makeGrid(128), 'vertex', {
          width: canvas.width,
          height: canvas.height,
          format,
          presentView: () => context.getCurrentTexture().createView(),
        });
        const intervals = [],
          cpu = [];
        const frames = quick ? 30 : 180;
        let previous;
        for (let i = 0; i < frames + 30; i++) {
          const time = await new Promise(requestAnimationFrame);
          const t = performance.now();
          renderer.draw(i * 0.03);
          const elapsed = performance.now() - t;
          if (i >= 30) {
            intervals.push(time - previous);
            cpu.push(elapsed);
          }
          previous = time;
        }
        await device.queue.onSubmittedWorkDone();
        renderer.dispose();
        context.unconfigure();
        if (errors.length) throw new Error(errors.join('\n'));
        return {
          ...metadata,
          status: 'complete',
          validation,
          ...suite,
          pacing: {
            strategy: 'vertex',
            size: 128,
            canvas: [canvas.width, canvas.height],
            intervalsMs: summarize(intervals),
            cpuMs: summarize(cpu),
            samples: { intervals, cpu },
            note: 'rAF intervals depend on display/browser scheduling; not input-to-photon latency.',
          },
        };
      } finally {
        device.destroy();
      }
    },
    { software, quick },
  );
  if (browserErrors.length) throw new Error(browserErrors.join('\n'));
  result.launch = { args: session.args, headed, browserVersion: session.browser.version() };
  await writeFile(filename, JSON.stringify(result, null, 2) + '\n');
  console.log(`Saved ${filename}`);
} catch (error) {
  await writeFile(
    'results/browser-blocked.json',
    JSON.stringify(
      {
        status: 'blocked',
        createdAt: new Date().toISOString(),
        softwareRequested: software,
        headed,
        error: String(error.stack ?? error),
        note: 'No completed browser benchmark. Do not substitute native results for browser measurements.',
      },
      null,
      2,
    ) + '\n',
  );
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await session?.browser.close();
}
