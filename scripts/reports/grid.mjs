import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { summarize } from '../../experiments/grid/model.js';

const cpu = JSON.parse(await readFile('results/cpu.json', 'utf8'));
const native = JSON.parse(await readFile('results/native-software.json', 'utf8'));
if (native.status !== 'complete')
  throw new Error('Native run incomplete; refusing to generate a report.');
const sourceFiles = [
  'experiments/grid/model.js',
  'experiments/grid/webgpu.js',
  'experiments/grid/suite.js',
  'src/frame-loop.js',
  'scripts/benchmarks/cpu.mjs',
  'scripts/benchmarks/native.mjs',
  'scripts/benchmarks/browser.mjs',
  'package-lock.json',
];
const hashes = {};
for (const file of sourceFiles)
  hashes[file] = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
await writeFile(
  'results/source-manifest.json',
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      note: 'Hashes captured when generating this report, not a git revision. Core grid model, shader and suite code were unchanged between the recorded full run and first report generation.',
      hashes,
    },
    null,
    2,
  ) + '\n',
);
const lines = [
  '# Experiment 001: deforming indexed grid',
  '',
  'ManimJS is a general-purpose JavaScript mathematical graphics library. Topology articles are its first intended showcase. This experiment does not freeze a public rendering API or select a final backend.',
  '',
  `Generated from results/cpu.json (${cpu.createdAt}) and results/native-software.json (${native.createdAt}).`,
  '',
  'Source hashes at report generation are in results/source-manifest.json. Raw samples, validation results and PNGs are retained alongside this report.',
  '',
  '## Scope and environment',
  '',
  `- CPU: ${cpu.cpu}; Node ${cpu.runtime}; V8 ${cpu.v8}.`,
  `- Rendering: ${native.adapter.description}; ${native.adapter.architecture}; fallback adapter = ${native.adapter.isFallbackAdapter}.`,
  '- No physical GPU device is exposed in the execution environment. Chromium startup is blocked by sandbox socket restrictions. Native Dawn + SwiftShader executes the shaders locally without a browser.',
  '- **These are CPU and software-renderer observations, not hardware GPU results or browser frame rates.**',
  '- Power mode, CPU frequency and competing host workloads were not controlled. Repeated shuffled rounds expose, but do not eliminate, noise.',
  '',
  '## CPU-only update experiment',
  '',
  'Five shuffled rounds per case. Each round has 60 warmup calls and 15 calibrated batches targeting 6 ms. Values below are the median of the five round medians; the range shows the slowest and fastest round medians. No allocations occur in the update loops.',
  '',
  '| Grid | Method | Median ms/update | Round median range (ms) |',
  '|---|---|---:|---:|',
];
for (const size of [32, 128, 512, 1024])
  for (const strategy of ['cpu-naive', 'cpu-rows', 'cpu-basis']) {
    const values = cpu.results
      .filter((r) => r.size === size && r.strategy === strategy)
      .map((r) => r.msPerUpdate.median);
    const s = summarize(values);
    lines.push(
      `| ${size} × ${size} | ${strategy} | ${s.median.toFixed(4)} | ${s.min.toFixed(4)}–${s.max.toFixed(4)} |`,
    );
  }
lines.push(
  '',
  'Naive evaluates sin for every vertex. Rows evaluates it once per grid row. Basis precomputes sin(3y) and cos(3y), evaluates sin/cos of phase once per update, and combines the row coefficients. This is a separable-map optimization, not a claim about arbitrary deformations.',
  '',
  '## Native software rendering',
  '',
  `Configuration: ${JSON.stringify(native.config)}.`,
  '',
  'The table aggregates the round medians. CPU time covers update, upload API calls, encoding, and submit. Drained time is a batch wall time divided by submitted frames, with a queue-completion wait only at each batch boundary. GPU timestamps cover compute/render passes only; they exclude queue uploads, CPU time, and presentation. Timestamp resolution is implementation dependent. Do not add CPU and GPU values together: their timelines overlap.',
  '',
  '| Grid | Strategy | CPU ms | Drained ms/frame | Render-pass ms | Compute-pass ms | Upload bytes/frame | GPU buffer bytes* |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
);
const strategies = [...new Set(native.results.map((r) => r.strategy))].sort();
for (const size of native.config.sizes)
  for (const strategy of strategies) {
    const rows = native.results.filter((r) => r.size === size && r.strategy === strategy);
    const median = (field) => {
      const s = summarize(rows.map((r) => r[field].median).filter((n) => n !== null));
      return s.median === null ? 'unavailable' : s.median.toFixed(3);
    };
    lines.push(
      `| ${size} | ${strategy} | ${median('cpuMs')} | ${median('drainedBatchMsPerFrame')} | ${median('gpuRenderPassMs')} | ${median('gpuComputePassMs')} | ${rows[0].uploadBytesPerFrame} | ${rows[0].bufferBytes} |`,
    );
  }
lines.push(
  '',
  '*Explicitly allocated GPU buffers including timestamp resolve/readback buffers; excludes driver internals, pipelines, textures, and JavaScript model fixtures. It is not total process/GPU memory.',
  '',
  '## Correctness gates',
  '',
  `- ${native.validation.checks.length} rendered cases checked across two grid sizes, zero/positive/negative amplitudes, and three phases.`,
  '- Every candidate image is compared against CPU-generated coordinates. Images must be nonempty; changed-pixel fraction must be <= 0.5% (RGB L1 difference > 12). This permits small rasterization shifts, not arbitrary visual equivalence.',
  '- Compute buffers are read back and checked against an independent JavaScript analytic reference.',
  `- Largest direct-sin compute coordinate error: ${Math.max(...native.validation.checks.filter((c) => c.strategy === 'compute').map((c) => c.maxCoordinateError)).toExponential(5)}.`,
  `- Largest precomputed-basis compute coordinate error: ${Math.max(...native.validation.checks.filter((c) => c.strategy === 'compute-basis').map((c) => c.maxCoordinateError)).toExponential(5)}.`,
  '- Initial 2e-6 direct-sin tolerance failed. WGSL permits f32 sin absolute error up to 2^-11 over [-π,π]. The shader now reduces its angle into that interval and the test budget is amplitude × 2^-11 plus rounding margin (1.3e-4 at amplitude 0.25). The basis variant retains the tighter 2e-6 tolerance. Speed must be reported together with precision.',
  '- Sample PNGs are saved in results/images. Lines use line-list rasterization without MSAA; production antialiased curves/text are not implemented or measured.',
  '',
  '## Decisions supported now',
  '',
  '1. Hoist shared mathematical work before considering a lower-level language. Row/basis methods avoid evaluating the same function for every vertex.',
  '2. Preserve static geometry. The vertex/basis/procedural paths upload 32 bytes of parameters per frame. Full CPU position updates upload 8 × vertex count + 32 bytes. Row-table uploads 4 × row count + 32 bytes.',
  '3. Keep compute as a candidate, not a default. It adds an intermediate output buffer and a pass. Test reuse across multiple draws before accepting that cost.',
  '4. Use demand-driven scheduling for static diagrams. Scheduler tests verify coalesced invalidations and zero queued frames while paused or hidden.',
  '5. Do not select a universal winner from SwiftShader. Browser/hardware results can reverse these rankings.',
  '',
  '## Next experimental gates',
  '',
  '- Run the existing browser harness on a physical integrated GPU and a discrete/mobile GPU; save adapter, browser, resolution and power conditions.',
  '- Compare equal-quality native WebGL2 and WebGPU implementations before committing to one backend.',
  '- Measure repeated geometry, draw-call batching, render bundles at high draw counts, and multiple article embeds; the current one-draw fixture cannot decide those questions.',
  '- Benchmark antialiased curves, picking, text, pixel density and startup separately. Test workers/WASM only against measured CPU bottlenecks.',
  '- Never promote a strategy on throughput alone: require numerical/visual checks and browser pacing, then measure interaction latency separately.',
  '',
  '## Sources',
  '',
  '- [WebGPU specification: timelines, timestamp queries, resource lifecycle](https://www.w3.org/TR/webgpu/)',
  '- [WGSL specification: floating-point accuracy](https://www.w3.org/TR/WGSL/#floating-point-accuracy)',
  '- [Chrome: developer features and timestamp quantization](https://developer.chrome.com/docs/web-platform/webgpu/developer-features)',
  '- [wgpu: resource allocation, uploads and submission guidance](https://wgpu.rs/doc/wgpu/documentation/best_practices/dos_and_donts/index.html)',
  '- [Dawn Node binding: native/offscreen support and limitations](https://github.com/dawn-gpu/node-webgpu)',
  '- [MDN: OffscreenCanvas and worker rendering](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)',
  '- [shadcn: composable, editable source distribution](https://ui.shadcn.com/docs)',
  '',
);
await writeFile('results/experiment-001.md', lines.join('\n'));
console.log('Wrote results/experiment-001.md');
