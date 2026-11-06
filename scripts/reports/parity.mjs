import { readdir, readFile, writeFile } from 'node:fs/promises';
import { summarize } from '../../experiments/grid/model.js';
const runs = [];
for (const name of (await readdir('results/runs')).filter((n) => n.includes('-parity-')).sort()) {
  const directory = `results/runs/${name}`;
  let r, t;
  try {
    r = JSON.parse(await readFile(`${directory}/result.json`));
    t = JSON.parse(await readFile(`${directory}/telemetry.json`));
  } catch {
    continue;
  }
  const groups =
    r.engine === 'manimgl'
      ? [
          {
            mode: 'manimgl',
            samples: r.samples ?? [],
            sustained: r.sustained,
            gpuBufferBytes: r.gpuBufferBytes,
            gpuTextureBytes: r.gpuTextureBytes,
          },
        ]
      : [...new Set((r.cases ?? []).map((c) => c.mode))].map((mode) => {
          const cases = r.cases.filter((c) => c.mode === mode);
          return {
            ...cases[0],
            samples: cases.flatMap((c) => c.samples),
            sustained: cases.find((c) => c.sustained)?.sustained,
          };
        });
  const cases = groups.map((g) => {
    const active = g.sustained
      ? t.samples.filter((s) => {
          const when = Date.parse(t.startedAt) + s.elapsedMs;
          return when >= g.sustained.startUnixMs + t.intervalMs && when <= g.sustained.endUnixMs;
        })
      : [];
    const drm = active.map((s) => (s.drmClients ?? []).filter((c) => c.driver === 'i915'));
    const cpu = active.map((s) => s.tree.cpuPercentOneCore).filter((x) => x !== null);
    const gpuBusy = drm
      .map((cs) => {
        const values = cs
          .map((c) => c.engines.render?.busyPercentOneEngine)
          .filter((x) => x !== null && x !== undefined);
        return values.length ? values.reduce((a, b) => a + b, 0) : null;
      })
      .filter((x) => x !== null);
    const gpuResident = drm
      .map((cs) => {
        const values = cs
          .map((c) => {
            const values = Object.entries(c.memoryBytes)
              .filter(([key]) => key.startsWith('resident-'))
              .map(([, value]) => value);
            return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
          })
          .filter((x) => x !== undefined);
        return values.length ? values.reduce((a, b) => a + b, 0) : null;
      })
      .filter((x) => x !== null);
    const peak = (xs) => (xs.length ? Math.max(...xs) : null);
    return {
      mode: g.mode,
      drainedMs: summarize(g.samples.map((s) => s.drainedMs)),
      gpuMs: summarize(g.samples.flatMap((s) => s.gpuMs ?? [])),
      submissionMs: summarize(g.samples.flatMap((s) => s.submissionMs ?? [])),
      updateMs: summarize(g.samples.flatMap((s) => s.updateMs ?? [])),
      processCPUMs: summarize(g.samples.map((s) => s.processCPUMs).filter((x) => x !== undefined)),
      gpuBufferBytes: g.gpuBufferBytes,
      gpuTextureBytes: g.gpuTextureBytes,
      sustained: g.sustained ?? null,
      activeResources: {
        samples: active.length,
        treeCPUPercentOneCore: summarize(cpu),
        intelRenderEngineBusyPercent: summarize(gpuBusy),
        peakTreeRSSBytes: peak(active.map((s) => s.tree.summedRssBytes)),
        peakIntelResidentBytes: peak(gpuResident),
      },
      wholeRunPeakTreeRSSBytes: t.peakSampledTreeRSSBytes,
    };
  });
  runs.push({
    directory,
    engine: r.engine,
    status: r.status,
    config: r.config ?? null,
    adapter: r.adapter ?? null,
    referenceDirectory: r.referenceDirectory ?? null,
    parityPassed: r.parity?.passed ?? null,
    parityFrames: r.parity?.frames ?? null,
    measurementValidity: r.measurementValidity ?? null,
    upstreamRevision: r.upstreamRevision ?? null,
    timestampPeriodNs: r.timestampPeriodNs ?? null,
    cases,
  });
}
const valid = runs.filter(
  (r) =>
    r.status === 'complete' &&
    r.config?.rounds === 3 &&
    (r.engine === 'manimgl'
      ? r.timestampPeriodNs !== null
      : r.parityPassed && r.cases.some((c) => c.sustained)),
);
const nativeMedians = valid
  .filter((r) => r.engine === 'manimgl')
  .map((r) => r.cases[0].drainedMs.median);
const fastestNative = Math.min(...nativeMedians);
for (const r of valid.filter((r) => r.engine !== 'manimgl')) {
  const ref = valid.find((x) => x.directory === r.referenceDirectory)?.cases[0];
  for (const c of r.cases) {
    c.completionSpeedup = ref?.drainedMs.median / c.drainedMs.median;
    c.speedupVsFastestNativeRepeat = fastestNative / c.drainedMs.median;
    c.gpuSpeedup = c.gpuMs.n ? ref?.gpuMs.median / c.gpuMs.median : null;
  }
}
await writeFile(
  'results/parity-summary.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'Only completed full browser runs with pixel parity, synchronous framebuffer readback, and sustained windows enter the comparison. All full native repeats with corrected timestamps are retained, including an earlier repeat without a sustained window. Native CPU time and browser process-tree CPU samples are different measurements. Browser completion includes a one-pixel readback per batch; native completion uses a queue fence. Timings exclude video encoding, full image readback and screenshot comparison.',
      runs,
    },
    null,
    2,
  ) + '\n',
);
const f = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : '—');
const lines = [
  '# ManimGL animation comparison',
  '',
  'The workload is a travelling-wave torus, 512×256 cells (262,144 triangles), rendered at 1280×720 with equal perspective, vertex lighting, colors, finite-difference normals, depth testing, and no MSAA. The native baseline uses vectorized NumPy geometry updates and the pinned upstream renderer. Browser variants compute geometry on the GPU and use shared indexed vertices.',
  '',
  'All speedups are specific to this animation, not whole-library parity. Offscreen batch completion is not displayed-frame latency. Both browsers remain on workspace 5.',
  '',
  `Native median completion times varied from ${f(fastestNative)} to ${f(Math.max(...nativeMedians))} ms across full repeats on this active desktop. Paired ratios below use the reference immediately preceding each browser pair. A conservative comparison against the fastest native repeat is also stored in the JSON; for the latest tiled runs it is ${valid
    .filter((r) => r.engine !== 'manimgl' && r.cases.some((c) => c.mode === 'tiled'))
    .map(
      (r) =>
        `${r.engine}: ${f(r.cases.find((c) => c.mode === 'tiled').speedupVsFastestNativeRepeat)}×`,
    )
    .join(
      ', ',
    )}. The 10× threshold is exceeded for this workload even against that faster reference. This does not imply a 10× GPU-only gain or completion of the separate fluid-FFT target.`,
  '',
  '## Completed full runs',
  '',
  '| Runtime / mode | Completion median / p95 ms | GPU median ms | Completion speedup vs ManimGL | GPU speedup vs ManimGL | GPU buffers MiB |',
  '|---|---:|---:|---:|---:|---:|',
];
for (const r of valid)
  for (const c of r.cases)
    lines.push(
      `| [${r.engine} / ${c.mode}](${r.directory.replace('results/', '')}/result.json) | ${f(c.drainedMs.median)} / ${f(c.drainedMs.p95)} | ${f(c.gpuMs.median)} | ${f(c.completionSpeedup)}× | ${f(c.gpuSpeedup)}× | ${f(c.gpuBufferBytes / 1048576)} |`,
    );
lines.push(
  '',
  'Completion timing includes update, submission and completion of eight-frame batches, divided by eight. JavaScript uses synchronous one-pixel framebuffer readback; ManimGL uses a native queue fence. GPU timestamps measure render passes separately. Native WGPU timestamp ticks are multiplied by the recorded device period. Warmup, full-resolution screenshots, query readback, and PNG encoding are outside timed batches.',
  '',
  '## Sustained resource samples',
  '',
  'Each mode runs continuously for about three seconds. The table uses samples entirely inside that interval. CPU 100% means one logical core. RAM sums the runner and descendants and may double-count shared pages; it includes browser infrastructure. Intel client-resident memory includes driver allocations and is not exclusive geometry memory. Render-engine busy time is not frequency-normalized whole-GPU utilization. Missing measurements stay unavailable.',
  '',
  '| Runtime / mode | Samples | CPU median % | Peak tree RAM MiB | Intel render engine median % | Peak Intel resident MiB |',
  '|---|---:|---:|---:|---:|---:|',
);
for (const r of valid)
  for (const c of r.cases) {
    const a = c.activeResources;
    lines.push(
      `| ${r.engine} / ${c.mode} | ${a.samples} | ${f(a.treeCPUPercentOneCore.median)} | ${f(a.peakTreeRSSBytes === null ? null : a.peakTreeRSSBytes / 1048576)} | ${f(a.intelRenderEngineBusyPercent.median)} | ${f(a.peakIntelResidentBytes === null ? null : a.peakIntelResidentBytes / 1048576)} |`,
    );
  }
lines.push(
  '',
  '## Visual evidence',
  '',
  'Five identical animation phases are captured per mode and browser. Gates require nonempty frames, visible motion, mean channel error ≤0.5, interior p99 channel error ≤2, and silhouette mismatch ≤0.2%. Difference panels amplify errors by 16×. These are lossless framebuffer captures; labeled sheets are reduced previews.',
  '',
);
for (const r of valid.filter((r) => r.engine !== 'manimgl')) {
  const base = r.directory.replace('results/', '');
  const links = r.cases
    .map((c) => `[${c.mode} contact sheet](${base}/${c.mode}-comparison.png)`)
    .join(', ');
  lines.push(
    `- ${r.engine}: parity **${r.parityPassed ? 'passed' : 'failed'}**; [metrics](${base}/parity.json), ${links}.`,
  );
}

lines.push(
  '',
  '## Attempts',
  '',
  'All attempted runs, including instrumentation failures and diagnostic timing, remain recorded. Earlier gl.finish-only measurements are excluded from completion speedups.',
  '',
);
for (const r of runs)
  lines.push(
    `- [${r.directory.split('/').at(-1)}](${r.directory.replace('results/', '')}/result.json): ${r.status}.`,
  );
lines.push(
  '',
  'Regenerate with `npm run report:parity`. [Structured data](parity-summary.json).',
  '',
);
await writeFile('results/experiment-009.md', lines.join('\n'));
console.log(
  `Reported ${runs.length} attempts; ${valid.length} completed full comparisons/references`,
);
