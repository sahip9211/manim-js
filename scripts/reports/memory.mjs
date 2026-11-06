import { readdir, readFile, writeFile } from 'node:fs/promises';
import { summarize } from '../../experiments/grid/model.js';
const runs = [];
const mean = (xs) =>
  xs.length && xs.every(Number.isFinite) ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
for (const name of (await readdir('results/runs')).filter((n) => n.includes('-memory-')).sort()) {
  const directory = `results/runs/${name}`;
  let r, t;
  try {
    r = JSON.parse(await readFile(`${directory}/result.json`));
    t = JSON.parse(await readFile(`${directory}/telemetry.json`));
  } catch {
    continue;
  }
  const checkpoints = (r.checkpoints ?? []).map((c) => ({
    name: c.name,
    browserRSSBytes: mean(c.samples.map((s) => s.browser.rssBytes)),
    browserPSSBytes: mean(c.samples.map((s) => s.browser.pssBytes)),
    browserPrivateBytes: mean(c.samples.map((s) => s.browser.privateBytes)),
    treeRSSBytes: mean(c.samples.map((s) => s.tree.rssBytes)),
    treePSSBytes: mean(c.samples.map((s) => s.tree.pssBytes)),
    browserHeap: c.browserHeap,
    coverage: c.samples.map((s) => s.coverage),
  }));
  const samples = r.cases?.flatMap((c) => c.samples) ?? [];
  const sustained = r.cases?.[0]?.sustained;
  const active = sustained
    ? t.samples.filter((s) => {
        const when = Date.parse(t.startedAt) + s.elapsedMs;
        return when >= sustained.startUnixMs + t.intervalMs && when <= sustained.endUnixMs;
      })
    : [];
  const cpu = active.map((s) => s.tree.cpuPercentOneCore).filter(Number.isFinite);
  const gpu = active
    .map((s) => {
      const values = (s.drmClients ?? [])
        .filter((c) => c.driver === 'i915')
        .map((c) => c.engines.render?.busyPercentOneEngine)
        .filter(Number.isFinite);
      return values.length ? values.reduce((a, b) => a + b, 0) : null;
    })
    .filter(Number.isFinite);
  const resident = active
    .map((s) => {
      const cs = (s.drmClients ?? []).filter((c) => c.driver === 'i915');
      return cs.length
        ? cs
            .flatMap((c) =>
              Object.entries(c.memoryBytes)
                .filter(([key]) => key.startsWith('resident-'))
                .map(([, value]) => value),
            )
            .reduce((a, b) => a + b, 0)
        : null;
    })
    .filter(Number.isFinite);
  runs.push({
    directory,
    status: r.status,
    engine: r.engine,
    variant: r.variant,
    round: r.round,
    settleMs: r.settleMs ?? 1500,
    full: r.config?.rounds === 3,
    parity: r.parity?.passed ?? null,
    error: r.error ?? null,
    pageErrorCount: r.errors?.length ?? null,
    metadata: r.metadata,
    checkpoints,
    completionMs: summarize(samples.map((s) => s.drainedMs)),
    gpuMs: summarize(samples.flatMap((s) => s.gpuMs ?? [])),
    activeCPUPercentOneCore: summarize(cpu),
    activeGPURenderPercent: summarize(gpu),
    peakGPUClientResidentBytes: resident.length ? Math.max(...resident) : null,
  });
}
const groups = [];
for (const settleMs of [...new Set(runs.map((r) => r.settleMs))].sort((a, b) => a - b))
  for (const engine of ['chromium', 'firefox'])
    for (const variant of ['frozen-010', 'instanced', 'canvas']) {
      const rows = runs.filter(
        (r) =>
          r.settleMs === settleMs &&
          r.engine === engine &&
          r.variant === variant &&
          r.full &&
          r.status === 'complete' &&
          r.parity,
      );
      if (!rows.length) continue;
      const at = (r, name, metric) => r.checkpoints.find((c) => c.name === name)?.[metric] ?? null;
      const stage = (name) => ({
        rssBytes: mean(rows.map((r) => at(r, name, 'browserRSSBytes'))),
        pssBytes: mean(rows.map((r) => at(r, name, 'browserPSSBytes'))),
        privateBytes: mean(rows.map((r) => at(r, name, 'browserPrivateBytes'))),
      });
      const before = stage('blank-browser'),
        active = stage('scene-after-rendering'),
        disposed = stage('disposed-after-12-cycles');
      groups.push({
        engine,
        variant,
        settleMs,
        runs: rows.length,
        blank: before,
        active,
        sceneIncrementPSSBytes: mean(
          rows.map((r) => {
            const a = at(r, 'scene-after-rendering', 'browserPSSBytes'),
              b = at(r, 'blank-browser', 'browserPSSBytes');
            return a === null || b === null ? null : a - b;
          }),
        ),
        disposed,
        completionMedianMs: mean(rows.map((r) => r.completionMs.median)),
        gpuMedianMs: mean(rows.map((r) => r.gpuMs.median)),
        cpuMedianPercent: mean(rows.map((r) => r.activeCPUPercentOneCore.median)),
        gpuBusyMedianPercent: mean(rows.map((r) => r.activeGPURenderPercent.median)),
        gpuBufferBytes: rows[0].metadata.gpuBufferBytes,
        explicitTextureBytes: rows[0].metadata.gpuTextureBytes,
      });
    }
await writeFile(
  'results/memory-summary.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'Two independent fresh-browser sessions per variant, reversed order on the second pass. No forced GC or browser-process/security flags. Checkpoints average three smaps snapshots; summaries average run values. PSS accounting is not itself a memory optimization. Browser subtotals exclude the Node runner and sampler subprocesses.',
      groups,
      runs,
    },
    null,
    2,
  ) + '\n',
);
const f = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : '—'),
  mb = (v) => (v === null ? null : v / 1048576);
const lines = [
  '# Experiment 010: surface memory and lifecycle',
  '',
  'The same 262,144-triangle torus and 1280×720 image are compared with the frozen renderer from commit `6558213`. All five captured phases must match the native ManimGL reference. Quality is unchanged.',
  '',
  '## Memory accounting',
  '',
  'Summed RSS counts shared pages in each process. PSS apportions shared pages among their users; it is a better estimate of a process group’s share of physical memory. Neither figure is the JavaScript heap. See [Linux proc documentation](https://docs.kernel.org/filesystems/proc.html). Changing accounting does not free memory.',
  '',
  'The table separates blank-browser overhead from the incremental scene. No garbage collection is forced. Three snapshots form a checkpoint; values below average fresh-process runs with reversed order. The suffix shows blank-browser settling time. The 15-second follow-up investigates startup noise independently of the initial 1.5-second runs. Browser subtotals exclude the Node runner and sampling subprocesses. Missing access produces null, not zero.',
  '',
  '| Browser / variant | Runs | Blank PSS MiB | Active PSS MiB | Scene increment PSS MiB | Active summed RSS MiB | PSS after 12 disposal cycles MiB |',
  '|---|---:|---:|---:|---:|---:|---:|',
];
for (const g of groups)
  lines.push(
    `| ${g.engine} / ${g.variant} (${g.settleMs / 1000}s) | ${g.runs} | ${f(mb(g.blank.pssBytes))} | ${f(mb(g.active.pssBytes))} | ${f(mb(g.sceneIncrementPSSBytes))} | ${f(mb(g.active.rssBytes))} | ${f(mb(g.disposed.pssBytes))} |`,
  );
lines.push(
  '',
  '## Throughput and allocations',
  '',
  '| Browser / variant | Completion ms | GPU ms | CPU % | GPU render engine % | Index bytes | Explicit texture MiB |',
  '|---|---:|---:|---:|---:|---:|---:|',
);
for (const g of groups)
  lines.push(
    `| ${g.engine} / ${g.variant} (${g.settleMs / 1000}s) | ${f(g.completionMedianMs, 3)} | ${f(g.gpuMedianMs, 3)} | ${f(g.cpuMedianPercent)} | ${f(g.gpuBusyMedianPercent)} | ${g.gpuBufferBytes} | ${f(mb(g.explicitTextureBytes), 3)} |`,
  );
lines.push(
  '',
  'Completion uses eight-frame batches with synchronous one-pixel readback. GPU time is separately queried where available. CPU 100% is one logical core; GPU utilization is Intel client render-engine busy time. Utilization is measured under continuous work, so faster throughput can raise utilization. Default browser framebuffer allocations are excluded from explicit textures but included where visible to process/DRM accounting. This is not displayed FPS.',
  '',
  '## Interpretation and selected default',
  '',
  'The instanced offscreen renderer is the new default. In the initial Chromium pair, scene-added PSS falls from 20.50 to 8.60 MiB (58%); whole-browser active PSS falls from 439.19 to 426.25 MiB (2.9%). Completion changes from 1.831 to 1.805 ms, which is a small difference on this desktop. The deterministic index allocation falls 4096-fold, from 3 MiB to 768 bytes; this ratio does not describe total RAM or throughput.',
  '',
  'Initial Firefox runs show substantial parent-process startup variation, including a missing snapshot when child processes exit. Their aggregate RAM changes do not establish a reliable percentage saving. The follow-up uses a longer blank-browser settling interval; all initial attempts remain in the tables. Direct canvas rendering is retained as an explicit experimental option, because the initial run offered little extra Chromium memory benefit and slower Firefox completion. It is not selected automatically.',
  '',
  "The longer Firefox follow-up averages 599.79 → 516.64 MiB active PSS and 102.83 → 33.37 MiB scene-added PSS. Completion increases from 1.356 to 1.621 ms (19.5% slower). Parent-process variation remains substantial, so these two repeats are a measured memory/throughput tradeoff, not a universal improvement or a precise Firefox savings estimate. The memory-focused default is instanced; `{ mode: 'tiled' }` remains available for comparison. No additional 10× throughput gain is established.",
  '',
  '## Changes tested',
  '',
  '- `frozen-010`: immutable earlier renderer, full 32-bit index mesh, preserved canvas buffer, and an extra depth-enabled default framebuffer.',
  '- `instanced`: one 768-byte 8×8 patch reused for all cells, no preserved canvas buffer, and no redundant default depth buffer. Existing full-resolution offscreen color/depth attachments remain.',
  '- `canvas`: the same instanced mesh renders into the browser framebuffer directly, eliminating the library-owned intermediate color/depth attachments. The browser still allocates its own framebuffer.',
  '',
  'GPU resources are unbound before deletion, following [WebGL resource-lifecycle guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). `dispose({ releaseContext: true })` additionally releases the context when the canvas will be discarded. Ordinary `dispose()` retains context reuse. Frozen disposal predates this option; repeated mount/unmount measurements compare the former terminal-disposal behavior with explicit new release. Browser and driver caches can retain memory after disposal; short runs do not prove the absence of all leaks.',
  '',
  'Screenshots are encoded as PNG in the browser and collected after active-scene measurements, avoiding a large RGBA/base64/JSON transfer before RAM sampling. This fixes benchmark overhead; it must not be credited as renderer memory savings. The older experiment’s whole-tree RAM is therefore not directly comparable to these isolated checkpoints.',
  '',
  'The initial runs queried `defaultFramebufferDepthBits` while the offscreen framebuffer was bound, so that field described the offscreen target. Their recorded `contextAttributes.depth` is the reliable default-context setting. Follow-up runs query default depth before creating attachments; no rendering behavior changes with this metadata correction.',
  '',
  '## Retained attempts and captures',
  '',
);
for (const r of runs)
  lines.push(
    `- [${r.directory.split('/').at(-1)}](${r.directory.replace('results/', '')}/result.json): ${r.status}, ${r.full ? 'full' : 'screening'}, parity ${r.parity === null ? 'not completed' : r.parity ? 'passed' : 'failed'}${r.parity ? `; [frames](${r.directory.replace('results/', '')}/${r.variant}-comparison.png)` : ''}.`,
  );
lines.push(
  '',
  'Run `npm run bench:memory`, then `npm run report:memory`. `--quick` screens one fresh session per mode with fewer timing rounds. `--variants=frozen-010,instanced` and `--browser=firefox` narrow the run. Add `--settle-ms=15000` to reproduce the startup-noise follow-up. Frozen sources and raw telemetry accompany every attempt.',
  '',
);
await writeFile('results/experiment-010.md', lines.join('\n'));
console.log(`Reported ${runs.length} attempts, ${groups.length} full comparison groups`);
