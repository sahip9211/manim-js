import { readdir, readFile, writeFile } from 'node:fs/promises';
import { summarize as quantiles } from '../../experiments/grid/model.js';
function summarize(values) {
  const result = quantiles(values),
    sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return {
    ...result,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
  };
}
const mean = (xs) =>
  xs.length && xs.every(Number.isFinite) ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const f = (x, n = 3) => (Number.isFinite(x) ? x.toFixed(n) : '—');
const mib = (x) => (Number.isFinite(x) ? x / 1048576 : null);
const attempts = [];
for (const name of (await readdir('results/runs'))
  .filter((n) => /-(patches|morph)-/.test(n))
  .sort()) {
  const directory = `results/runs/${name}`;
  let r, t;
  try {
    r = JSON.parse(await readFile(`${directory}/result.json`));
    t = JSON.parse(await readFile(`${directory}/telemetry.json`));
  } catch {
    continue;
  }
  const cases =
    r.engine === 'manimgl'
      ? [{ mode: 'ManimGL Transform', samples: r.samples, sustained: r.sustained }]
      : (r.cases ?? []);
  const groups = [];
  for (const mode of [...new Set(cases.map((c) => c.mode))]) {
    const cs = cases.filter((c) => c.mode === mode),
      samples = cs.flatMap((c) => c.samples ?? []),
      metadata = cs[0].metadata ?? {};
    const intervals = cs.map((c) => c.sustained).filter(Boolean);
    const active = t.samples.filter((s) =>
      intervals.some((i) => {
        const at = Date.parse(t.startedAt) + s.elapsedMs;
        return at >= i.startUnixMs + t.intervalMs && at <= i.endUnixMs;
      }),
    );
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
        const values = (s.drmClients ?? [])
          .filter((c) => c.driver === 'i915')
          .flatMap((c) =>
            Object.entries(c.memoryBytes)
              .filter(([k]) => k.startsWith('resident-'))
              .map(([, v]) => v),
          );
        return values.length ? values.reduce((a, b) => a + b, 0) : null;
      })
      .filter(Number.isFinite);
    groups.push({
      mode,
      metadata,
      completionMs: summarize(samples.map((s) => s.drainedMs)),
      gpuMs: summarize(samples.flatMap((s) => s.gpuMs ?? [])),
      submissionMs: summarize(samples.flatMap((s) => s.submissionMs ?? [])),
      cpuPercentOneCore: summarize(
        active.map((s) => s.tree.cpuPercentOneCore).filter(Number.isFinite),
      ),
      gpuBusyPercent: summarize(gpu),
      peakGPUClientResidentBytes: resident.length ? Math.max(...resident) : null,
      meanBrowserPSSBytes: mean(cs.map((c) => c.memory?.browser.pssBytes ?? null)),
      meanBrowserRSSBytes: mean(cs.map((c) => c.memory?.browser.rssBytes ?? null)),
      peakTreeRSSBytes: active.length
        ? Math.max(...active.map((s) => s.tree.rssBytes).filter(Number.isFinite))
        : null,
      setup: cs.map((c) => c.setup ?? { setupMs: c.setupMs }),
      nativeGPUBufferBytes: r.gpuBufferBytes ?? null,
      nativeGPUTextureBytes: r.gpuTextureBytes ?? null,
    });
  }
  attempts.push({
    directory,
    kind: name.includes('-patches-') ? 'patches' : 'morph',
    engine: r.engine ?? 'manimgl',
    status: r.status,
    error: r.error ?? null,
    pageErrors: r.errors ?? [],
    frames: r.config?.frames,
    batchSize: r.config?.batchSize,
    parity: r.parity?.passed ?? null,
    groups,
  });
}
await writeFile(
  'results/surfaces-summary.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), attempts }, null, 2) + '\n',
);
for (const kind of ['patches', 'morph']) {
  const rows = attempts.filter((r) => r.kind === kind),
    isPatch = kind === 'patches';
  const lines = [
    `# Experiment ${isPatch ? '011: factoring surface normals and sizing patches' : '012: parametric Surface and Transform'}`,
    '',
    isPatch
      ? 'The frozen baseline is commit `196e314`: 8×8 instanced indices and five point evaluations per normal. All candidates retain the same 512×256 cells, 262,144 triangles, camera, lighting, and 1280×720 render target.'
      : 'A general user-supplied parameter map and target map are sampled once. The GPU interpolates endpoints and RGB colors, then constructs normals from the interpolated geometry. The pinned ManimGL reference uses its actual `Transform(surface, target, rate_func=linear)` implementation, with matching sample grids and colors. This verifies an opaque, same-grid straight-path subset, not all Transform behavior.',
    '',
    '## Measurements',
    '',
    '| Run / browser / mode | Completed batch ms/frame | GPU ms/frame | CPU % | GPU render % | Browser PSS MiB | Index bytes | Owned GPU textures MiB |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const r of rows)
    for (const g of r.groups)
      lines.push(
        `| ${r.directory.split('/').at(-1).slice(0, 19)} / ${r.engine} / ${g.mode} | ${f(g.completionMs.median)} | ${f(g.gpuMs.median)} | ${f(g.cpuPercentOneCore.median, 1)} | ${f(g.gpuBusyPercent.median, 1)} | ${f(mib(g.meanBrowserPSSBytes), 1)} | ${g.metadata.indexBytes ?? '—'} | ${f(mib(g.metadata.gpuTextureBytes ?? g.nativeGPUTextureBytes))} |`,
      );
  lines.push(
    '',
    'Medians average the two middle samples for even counts and summarize completed batch averages, not display FPS or input latency. GPU timers are unavailable in this Firefox configuration. CPU 100% is one core. GPU utilization is Intel render-client busy time. Cases alternate order across rounds inside a fresh browser session; PSS snapshots include browser startup, earlier cases, caches and automation and are not isolated scene increments. Do not compare those PSS snapshots as a causal memory-saving percentage. Explicit textures include library color/depth targets and exclude the browser framebuffer. The JSON summary includes setup, CPU/GPU statistics, RSS, PSS, resident GPU memory, and retained errors.',
    '',
  );
  if (isPatch)
    lines.push(
      '## Selection and limits',
      '',
      'Larger patches alone were not a consistent Firefox win. The selected torus path uses a 32×32 patch, preserving the inner 8×8 triangle order. Its index allocation is 12,288 bytes: 11,520 bytes more than the previous default, and 256 times smaller than the original 3 MiB mesh. Small grids retain 8×8 patches. This is a bounded index-memory tradeoff, not a total-RAM reduction.',
      '',
      'The [factored normal derivation](../docs/surface-performance.md) uses angle-addition identities for the exact discrete central differences, not continuous analytic normals. Boundary rows keep the original one-sided differences. Position, topology, shading constants and image gates remain unchanged. User-defined parametric surfaces retain sampled finite differences; the torus formula does not apply to arbitrary maps. Earlier metadata estimated the procedural animation payload as 32 bytes; the actual scalar/vector uniform arguments total 28 bytes, now corrected. This is logical payload, not measured driver traffic.',
      '',
      'The short-batch confirmation measured 1.115 → 1.018 ms in Chromium and 1.462 → 1.234 ms in Firefox. The independent 32-frame-batch follow-up measured 1.046 → 0.926 ms in Chromium and 0.877 → 0.840 ms in Firefox. The Firefox benefit is smaller under the longer timing protocol; these active-desktop tests do not establish a universal gain or another 10× speedup. Both protocols pass five-phase ManimGL image checks.',
    );
  else
    lines.push(
      '## API and performance contract',
      '',
      '`ManimJS.experimental.createSurface(canvas, { map, targetMap, uRange, vRange, uSegments, vSegments, color, targetColor, duration, easing })` creates a seekable surface. `seek(progress)` renders synchronously, `play()` runs once to the target, `pause()` suspends playback, and `dispose()` releases resources. Playback stops scheduling work after completion and while hidden. `easing` is `linear` or ManimGL-style quintic `smooth`.',
      '',
      'Maps are sampled only at creation. Each endpoint stores float32 xyz plus RGB8 packed exactly into a float32 integer. Two 513×257 RGBA32F textures use 4.023 MiB; a static surface shares one endpoint texture. Each frame uploads one alpha float (4 bytes), with no geometry upload or CPU interpolation. Sampling has an upfront CPU/memory cost recorded separately; throughput excludes setup in both implementations. RGB8 endpoint quantization is explicit and matched by the native fixture. Opacity, curved transform paths, unequal resolutions, dynamic remeshing, imported meshes and multiple-object scenes are not supported by this API.',
      '',
      'Native and browser capture five equally specified progress values. Intermediate colors interpolate after unpacking; normals are computed from intermediate points rather than interpolating precomputed normals. The pole-neighbor fallback follows the pinned ManimGL surface shader. The benchmark validates the dense torus-to-deformed-torus transform; it does not establish visual parity for every user map. See [feature coverage](../docs/feature-parity.md) and [the runnable example](../examples/surface-morph.html).',
    );
  lines.push('', '## Retained attempts', '');
  for (const r of rows) {
    lines.push(
      `- [${r.directory.split('/').at(-1)}](${r.directory.replace('results/', '')}/result.json): ${r.status}, parity ${r.parity === null ? 'not applicable/incomplete' : r.parity ? 'passed' : 'failed'}${r.error ? '; see retained error' : ''}.`,
    );
    if (r.parity)
      for (const g of r.groups)
        lines.push(
          `  - [${g.mode} frame comparisons](${r.directory.replace('results/', '')}/${g.mode}-comparison.png).`,
        );
  }
  if (!isPatch)
    lines.push(
      '',
      'The first native attempt failed while reading an instrumentation-only byte counter (`StructuredArray.nbytes`); the pinned API exposes `StructuredArray.array.nbytes`. Its error, captures and source snapshot are retained. It supplies no successful performance result. The runner now preserves a partial native report if a later attempt fails.',
    );
  lines.push(
    '',
    isPatch
      ? 'Reproduce: `npm run bench:patches`; then `npm run bench:patches -- --variants=frozen-011,factored8,factored32`; then `npm run bench:patches -- --variants=frozen-011,factored32 --frames=192 --batch-size=32`.'
      : 'Reproduce: `npm run bench:morph`. Native dependencies and the ignored reference checkout are described in [the parity guide](../docs/manimgl-parity.md).',
    'Regenerate both reports with `npm run report:surfaces`.',
    '',
  );
  await writeFile(`results/experiment-${isPatch ? '011' : '012'}.md`, lines.join('\n'));
}
console.log(`Reported ${attempts.length} attempts`);
