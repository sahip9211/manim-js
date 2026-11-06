import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { nativeDevice } from '../lib/native-device.mjs';
import { validateRenderers, runSuite } from '../../experiments/grid/suite.js';
import { png } from '../lib/png.mjs';

const software = process.argv.includes('--software');
const quick = process.argv.includes('--quick');
const validateOnly = process.argv.includes('--validate-only');
const filename = validateOnly
  ? 'results/native-validation-run.json'
  : software
    ? 'results/native-software.json'
    : 'results/native-hardware.json';
await mkdir('results/images', { recursive: true });
const session = await nativeDevice(software);
console.log(JSON.stringify(session.metadata));
const errors = [];
session.device.addEventListener('uncapturederror', (event) => {
  errors.push(event.error.message);
  console.error(event.error.message);
});
const output = {
  experiment: '001-grid-deformation',
  createdAt: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model,
  ...session.metadata,
  status: 'running',
  limitations: [
    'Native Dawn: no browser JS-to-GPU-process IPC or canvas presentation.',
    ...(session.metadata.adapter.isFallbackAdapter
      ? ['Software rasterizer: not physical GPU performance.']
      : []),
    'Offscreen fixed-resolution throughput; not displayed FPS or user interaction latency.',
    'GPU pass timestamps exclude uploads, CPU work, and query readback; may be quantized.',
  ],
};
try {
  output.validation = await validateRenderers(
    session.device,
    async (strategy, pixels, width, height) => {
      await writeFile(`results/images/${strategy}.png`, png(pixels, width, height));
    },
  );
  console.log(`Validated ${output.validation.checks.length} rendered cases`);
  await writeFile(
    'results/validation-native.json',
    JSON.stringify({ ...session.metadata, validation: output.validation }, null, 2) + '\n',
  );
  if (!validateOnly) {
    const progress = [];
    output.results = progress;
    const suite = await runSuite(session.device, {
      ...(quick
        ? { sizes: [32], rounds: 1, batchFrames: 4, measuredBatches: 2, warmupFrames: 8 }
        : {}),
      onResult: async (result) => {
        progress.push(result);
        console.log(
          `round ${result.round + 1} n=${result.size} ${result.strategy}: CPU ${result.cpuMs.median.toFixed(3)} ms, drained ${result.drainedBatchMsPerFrame.median.toFixed(3)} ms`,
        );
        await writeFile(filename, JSON.stringify({ ...output, results: progress }, null, 2) + '\n');
      },
    });
    Object.assign(output, suite);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  output.status = 'complete';
  await writeFile(filename, JSON.stringify(output, null, 2) + '\n');
} catch (error) {
  output.status = 'failed';
  output.error = String(error.stack ?? error);
  await writeFile(filename, JSON.stringify(output, null, 2) + '\n');
  throw error;
} finally {
  session.device.destroy();
}
