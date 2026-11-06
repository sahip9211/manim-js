import { readdir, readFile, writeFile } from 'node:fs/promises';
import { summarize } from '../../experiments/grid/model.js';
const rebased = process.argv.includes('--rebased'),
  output = rebased ? 'rebased-log' : 'optimization-log';
const runs = [];
for (const directory of (await readdir('results/runs')).sort()) {
  const path = `results/runs/${directory}`;
  let r, t;
  try {
    r = JSON.parse(await readFile(`${path}/result.json`));
    t = JSON.parse(await readFile(`${path}/telemetry.json`));
  } catch {
    continue;
  }
  if (!r.experiment?.startsWith(rebased ? '008-' : '007-')) continue;
  const groups = new Map();
  for (const row of r.results ?? []) {
    const variant = row.variant ?? row.pressureKernel ?? row.method ?? 'unknown',
      key = `${row.size}/${variant}${row.profileStages ? '/' + row.workgroup.join('x') : ''}`;
    if (!groups.has(key))
      groups.set(key, {
        size: row.size,
        variant,
        profileStages: row.profileStages ?? false,
        workgroup: row.workgroup ?? null,
        compute: [],
        render: [],
        total: [],
        drained: [],
        submission: [],
        initialization: [],
        errors: [],
        gpuBufferBytes: row.gpuBufferBytes ?? null,
        representation: row.representation ?? 'dense',
        logicalCells: row.logicalCells ?? row.size ** 3,
        storedCells: row.storedCells ?? row.size ** 3,
        correctness: [],
      });
    const g = groups.get(key);
    for (const sample of (Array.isArray(row.samples) ? row.samples : row.samples?.gpu) ?? []) {
      if (sample?.computeMs !== undefined) {
        g.compute.push(sample.computeMs);
        g.render.push(sample.renderMs);
        g.total.push(sample.computeMs + sample.renderMs);
      }
    }
    g.drained.push(...(row.samples?.drained ?? []));
    g.submission.push(...(row.samples?.submission ?? []));
    if (row.method) g.initialization.push(...row.samples);
    if (row.correctness) {
      g.correctness.push(row.correctness.passed);
      g.errors.push(row.correctness.equivalence?.maxAbsolute ?? null);
    }
  }
  const cases = [...groups.values()].map((g) => ({
    size: g.size,
    variant: g.variant,
    profileStages: g.profileStages,
    workgroup: g.workgroup,
    computeMs: summarize(g.compute),
    renderMs: summarize(g.render),
    totalGpuMs: summarize(g.total),
    drainedMs: summarize(g.drained),
    submissionMs: summarize(g.submission),
    initializationMs: summarize(g.initialization),
    gpuBufferBytes: g.gpuBufferBytes,
    representation: g.representation,
    logicalCells: g.logicalCells,
    storedCells: g.storedCells,
    maxFieldDifference: g.errors.length ? Math.max(...g.errors) : null,
    passed: g.correctness.length ? g.correctness.every(Boolean) : null,
  }));
  for (const c of cases) {
    const baseline = cases.find(
      (x) =>
        x.size === c.size &&
        x.variant === (c.initializationMs.n ? 'scalar' : rebased ? 'frozen-008' : 'packed4'),
    );
    c.computeSpeedup =
      baseline?.computeMs.median && c.computeMs.median
        ? baseline.computeMs.median / c.computeMs.median
        : null;
    c.totalGpuSpeedup =
      baseline?.totalGpuMs.median && c.totalGpuMs.median
        ? baseline.totalGpuMs.median / c.totalGpuMs.median
        : null;
    c.initializationSpeedup =
      baseline?.initializationMs.median && c.initializationMs.median
        ? baseline.initializationMs.median / c.initializationMs.median
        : null;
  }
  runs.push({
    directory: path,
    experiment: r.experiment,
    baseline: r.baseline ?? null,
    status: r.status,
    engine: r.engine ?? r.runtime,
    adapter: r.adapter ?? null,
    browserVersion: r.browserVersion ?? null,
    windowPlacement: r.windowPlacement ?? null,
    pageVisibility: r.pageVisibility ?? null,
    sourceHashes: r.sourceHashes,
    validation: r.validation ?? r.checks ?? [],
    stability: r.stability ?? null,
    errors: r.errors,
    error: r.error ?? null,
    protocol: r.protocol ?? null,
    cases,
    telemetry: {
      elapsedSeconds: t.elapsedMs / 1000,
      runnerCPUSeconds: (t.cpuTimeUs.user + t.cpuTimeUs.system) / 1e6,
      peakTreeRSSMiB: t.peakSampledTreeRSSBytes / 1048576,
      peakRunnerHeapMiB: t.peakSampledHeapUsedBytes / 1048576,
      samples: t.samples.length,
      eventLoopDelayMs: t.eventLoopDelayMs,
      deviceWideGPUCounters: t.gpuCounters,
      drmClientsAvailable: t.samples.some((s) => s.drmClients?.length),
      warnings: t.warnings,
    },
    runnerGC: r.runnerGC ?? null,
  });
}
await writeFile(
  `results/${output}.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'No failed attempts deleted. Speedups compare medians within a run; failed/quick/profile runs are not full performance validation. GPU memory excludes driver allocations; process-tree RSS can double-count shared pages.',
      runs,
    },
    null,
    2,
  ) + '\n',
);
const fmt = (x, n = 3) => (x === null || x === undefined ? '—' : Number(x).toFixed(n)),
  lines = [
    rebased ? '# Rebased optimization experiment log' : '# Optimization experiment log',
    '',
    `Generated ${new Date().toISOString()}. Raw data, telemetry and frozen SHA-256 source snapshots accompany each attempt.`,
    '',
    rebased
      ? 'All speedups in this log use frozen-008, the already optimized FFT baseline. The target is a further 10× in simulation plus rendering. Conditional symmetry modes report logical and stored cells separately; they are not general dense-field speedups.'
      : 'The 10× target refers to the same evolving workload, not a larger iteration count, lower resolution or a startup-only gain. Separate columns distinguish GPU simulation, rendering and submit-to-completion timing. Offscreen browser results are not display latency. Failed attempts remain visible.',
    '',
    '## Attempts and resources',
    '',
    '| Attempt | Runtime / adapter | Status | Duration s | Peak tree RSS MiB | Runner CPU s | GPU errors |',
    '|---|---|---|---:|---:|---:|---:|',
  ];
for (const r of runs)
  lines.push(
    `| [${r.directory.split('/').at(-1)}](${r.directory.replace('results/', '')}/result.json) | ${r.engine ?? ''} ${r.adapter?.vendor ?? ''} | ${r.status} | ${fmt(r.telemetry.elapsedSeconds, 1)} | ${fmt(r.telemetry.peakTreeRSSMiB, 1)} | ${fmt(r.telemetry.runnerCPUSeconds, 1)} | ${r.errors?.length ?? 0} |`,
  );
lines.push(
  '',
  'Whole-run resource values include setup, CPU references, validation, readbacks and sampling overhead. Runner CPU excludes browser-process CPU; per-sample tree CPU, DRM counters and device-wide GPU counters are in each telemetry.json. Missing counters are not zero. Node GC entries describe the runner only; portable page APIs do not expose browser GC events.',
  '',
  '## Full paired GPU comparisons',
  '',
  'Twelve final-step GPU samples per case across three shuffled rounds. Ratios are within a run. Numerical acceptance remains 2e-5 absolute/relative field error and at most one 8-bit render-channel value.',
  '',
  '| Run | Grid | Kernel | Simulation median / p95 ms | Render median ms | GPU total speedup | Completion median ms | GPU buffers MiB | Logical / stored cells | Max field error |',
  '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|',
);
for (const r of runs.filter((r) => r.status === 'complete' && r.protocol?.rounds === 3))
  for (const c of r.cases)
    lines.push(
      `| [${r.directory.split('/').at(-1)}](${r.directory.replace('results/', '')}/result.json) | ${c.size}³ | ${c.variant} | ${fmt(c.computeMs.median)} / ${fmt(c.computeMs.p95)} | ${fmt(c.renderMs.median)} | ${fmt(c.totalGpuSpeedup, 2)}× | ${fmt(c.drainedMs.median)} | ${fmt(c.gpuBufferBytes / 1048576, 2)} | ${c.logicalCells} / ${c.storedCells} | ${c.maxFieldDifference?.toExponential(3) ?? '—'} |`,
    );
lines.push(
  '',
  '## JavaScript initialization',
  '',
  'These are initialization-only measurements, including output allocation and any GC pauses. The output is bitwise checked against the frozen scalar implementation. Fifteen samples per method/size, five shuffled rounds; no forced GC or discarded slow samples.',
  '',
  '| Run | Grid | Method | Median / p95 ms | Initialization speedup |',
  '|---|---:|---|---:|---:|',
);
for (const r of runs.filter(
  (r) => r.status === 'complete' && r.experiment === '007-js-initialization',
))
  for (const c of r.cases)
    lines.push(
      `| [${r.directory.split('/').at(-1)}](${r.directory.replace('results/', '')}/result.json) | ${c.size}³ | ${c.variant} | ${fmt(c.initializationMs.median)} / ${fmt(c.initializationMs.p95)} | ${fmt(c.initializationSpeedup, 2)}× |`,
    );
lines.push(
  '',
  `[Machine-readable comparison](${output}.json). Regenerate with node scripts/reports/optimization.mjs${rebased ? ' --rebased' : ''}.`,
  '',
);
await writeFile(`results/${output}.md`, lines.join('\n'));
console.log(`Documented ${runs.length} experiment attempts`);
