import { readdir, readFile, writeFile } from 'node:fs/promises';
import { summarize } from '../../experiments/grid/model.js';
import { png } from '../lib/png.mjs';

const latest = new Map();
for (const name of (await readdir('results/runs')).sort()) {
  const directory = `results/runs/${name}`;
  let result, telemetry;
  try {
    result = JSON.parse(await readFile(`${directory}/result.json`));
    telemetry = JSON.parse(await readFile(`${directory}/telemetry.json`));
  } catch {
    continue;
  }
  if (
    result.experiment !== '006-vortex3d' ||
    result.status !== 'complete' ||
    result.protocol?.rounds !== 3
  )
    continue;
  latest.set(`${result.engine}/${result.adapter?.vendor}/${result.adapter?.description}`, {
    directory,
    result,
    telemetry,
  });
}
const runs = [],
  rows = [];
for (const { directory, result: r, telemetry: t } of latest.values()) {
  const label =
    r.engine === 'native'
      ? `Native ${r.adapter.vendor === 'nvidia' ? 'NVIDIA MX250' : 'Intel'}`
      : `${r.engine} ${r.browserVersion}`;
  try {
    const p = JSON.parse(await readFile(`${directory}/preview.json`));
    await writeFile(`${directory}/preview.png`, png(Uint8Array.from(p.pixels), p.width, p.height));
  } catch (error) {
    console.warn(`No preview for ${directory}: ${error.message}`);
  }
  const valid = (a) => a.filter((x) => x !== null && Number.isFinite(x));
  const peak = (a) => (valid(a).length ? Math.max(...valid(a)) : null);
  runs.push({
    label,
    directory,
    referenceChecks: r.validation.length,
    timedChecks: r.results.length,
    stability: r.stability,
    errors: r.errors,
    sourceHashes: r.sourceHashes,
    elapsedSeconds: t.elapsedMs / 1000,
    peakTreeRSSMiB: t.peakSampledTreeRSSBytes / 1048576,
    peakRunnerHeapMiB: t.peakSampledHeapUsedBytes / 1048576,
    runnerCPUSeconds: (t.cpuTimeUs.user + t.cpuTimeUs.system) / 1e6,
    peakTreeCPUPercentOneCore: peak(t.samples.map((s) => s.tree.cpuPercentOneCore)),
    peakIntelRenderPercentOneEngine: peak(
      t.samples.flatMap((s) =>
        (s.drmClients ?? [])
          .filter((c) => c.driver === 'i915')
          .map((c) => c.engines.render?.busyPercentOneEngine ?? null),
      ),
    ),
    peakNVIDIADeviceBusyPercent: peak(
      t.samples.flatMap((s) =>
        (s.gpu ?? []).filter((g) => g.card.startsWith('nvidia')).map((g) => g.busyPercent),
      ),
    ),
    peakNVIDIADeviceVRAMMiB: peak(
      t.samples.flatMap((s) =>
        (s.gpu ?? [])
          .filter((g) => g.card.startsWith('nvidia'))
          .map((g) => (g.vramUsedBytes === null ? null : g.vramUsedBytes / 1048576)),
      ),
    ),
    pageVisibility: r.pageVisibility ?? null,
    windowPlacement: r.windowPlacement ?? null,
  });
  for (const size of r.protocol.sizes) {
    const stats = {};
    for (const kernel of ['packed4', 'fft-jacobi']) {
      const cases = r.results.filter((x) => x.size === size && x.pressureKernel === kernel),
        gpu = cases.flatMap((x) => x.samples.gpu).filter(Boolean);
      stats[kernel] = {
        computeMs: summarize(gpu.map((x) => x.computeMs)),
        renderMs: summarize(gpu.map((x) => x.renderMs)),
        totalGpuMs: summarize(gpu.map((x) => x.computeMs + x.renderMs)),
        drainedMs: summarize(cases.flatMap((x) => x.samples.drained)),
        submissionMs: summarize(cases.flatMap((x) => x.samples.submission)),
        gpuBufferMiB: cases[0].gpuBufferBytes / 1048576,
        maxAbsoluteError: Math.max(...cases.map((x) => x.correctness.equivalence.maxAbsolute)),
        maxPixelError: Math.max(...cases.map((x) => x.correctness.pixelMaxAbsolute)),
        passed: cases.every((x) => x.correctness.passed),
      };
    }
    rows.push({
      label,
      size,
      ...stats,
      computeSpeedup: stats.packed4.computeMs.median / stats['fft-jacobi'].computeMs.median,
      totalGpuSpeedup: stats.packed4.totalGpuMs.median / stats['fft-jacobi'].totalGpuMs.median,
    });
  }
}
const note =
  'Latest completed full run per runtime/adapter. Within-run medians of 12 last-step GPU samples; three shuffled rounds. Whole-run resources include setup, validation, telemetry and stability checks. Device-wide counters include unrelated applications; background completion is not presentation latency. Historical failures remain in results/runs.';
await writeFile(
  'results/vortex-summary.json',
  JSON.stringify({ note, runs, rows }, null, 2) + '\n',
);
console.log(note);
console.table(
  rows.map((r) => ({
    runtime: r.label,
    size: r.size,
    packedGPU: r.packed4.computeMs.median,
    fftGPU: r['fft-jacobi'].computeMs.median,
    speedup: r.computeSpeedup,
    totalGPU: r.totalGpuSpeedup,
    error: r['fft-jacobi'].maxAbsoluteError,
  })),
);
