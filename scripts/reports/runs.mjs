import { readdir, readFile, writeFile } from 'node:fs/promises';

const rows = [];
for (const directory of (await readdir('results/runs')).sort()) {
  const path = `results/runs/${directory}`;
  let result, telemetry;
  try {
    result = JSON.parse(await readFile(`${path}/result.json`));
    telemetry = JSON.parse(await readFile(`${path}/telemetry.json`));
  } catch {
    continue;
  }
  for (const entry of result.results?.length ? result.results : [{}])
    rows.push({
      run: path,
      status: result.status,
      engine: result.engine ?? result.runtime ?? 'unknown',
      browserVersion: result.browserVersion ?? null,
      experimentalWebGPU: result.experimentalWebGPU ?? false,
      automation: result.automation ?? null,
      adapter: result.adapter?.description ?? null,
      adapterVendor: result.adapter?.vendor ?? null,
      fallbackAdapter: result.adapter?.isFallbackAdapter ?? null,
      size: entry.size ?? null,
      dimensions: entry.dimensions ?? null,
      cells: entry.cells ?? null,
      variant: entry.pressureKernel
        ? `${entry.pressureKernel}${entry.workgroup ? '/' + (Array.isArray(entry.workgroup) ? entry.workgroup.join('x') : entry.workgroup) : ''}`
        : (entry.mode ?? entry.workgroup?.join('x') ?? null),
      round: entry.round ?? null,
      pressureWorkgroup: entry.pressureWorkgroup ?? null,
      vectorWidth: entry.vectorWidth ?? 1,
      fusePressureInit: entry.fusePressureInit ?? false,
      profileStages: entry.profileStages ?? false,
      windowWorkspace: result.windowPlacement?.workspace ?? null,
      pageVisibility: result.pageVisibility ?? null,
      drainedBatchMeanMedianMs: entry.drainedMs?.median ?? null,
      drainedBatchMeanP95Ms: entry.drainedMs?.p95 ?? null,
      cpuSubmissionMedianMs: entry.submissionMs?.median ?? null,
      gpuComputeSamplesMs:
        (Array.isArray(entry.samples) ? entry.samples : entry.samples?.gpu)
          ?.filter(Boolean)
          .map((x) => x.computeMs) ?? null,
      gpuRenderSamplesMs:
        (Array.isArray(entry.samples) ? entry.samples : entry.samples?.gpu)
          ?.filter(Boolean)
          .map((x) => x.renderMs) ?? null,
      gpuBufferBytes: entry.gpuBufferBytes ?? entry.bufferAllocationBytes ?? null,
      gpuTextureBytes: entry.gpuTextureBytes ?? null,
      numericalCheckPassed: entry.correctness?.passed ?? null,
      nonFiniteValues: entry.correctness?.actual?.nonFinite ?? null,
      divergenceRms: entry.correctness?.actual?.divergenceRms ?? null,
      dyeMassRelativeDrift: entry.correctness?.dyeMassRelativeDrift ?? null,
      kineticEnergy: entry.correctness?.actual?.energy ?? null,
      enstrophy: entry.correctness?.actual?.enstrophy ?? null,
      equivalenceMaxAbsolute: entry.correctness?.equivalence?.maxAbsolute ?? null,
      pixelMaxAbsolute: entry.correctness?.pixelMaxAbsolute ?? null,
      runPeakRSSBytes: telemetry.peakSampledRSSBytes,
      runPeakNodeHeapBytes: telemetry.peakSampledHeapUsedBytes,
      runPeakTreeRSSBytes: telemetry.peakSampledTreeRSSBytes,
      runCPUTimeUs: telemetry.cpuTimeUs.user + telemetry.cpuTimeUs.system,
      runElapsedMs: telemetry.elapsedMs,
      runGPUCountersAvailable: telemetry.gpuCounters !== null,
      runDRMClientsAvailable: telemetry.samples.some((x) => x.drmClients?.length),
    });
}
await writeFile(
  'results/run-summary.json',
  JSON.stringify(
    {
      note: 'Resource peaks and CPU totals are whole-run values, repeated per case for joining. GPU counters unavailable is not zero usage. Batch-mean percentiles are not per-frame latency.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
const keys = Object.keys(rows[0] ?? {}),
  csv = (value) =>
    '"' +
    (value === null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
    ).replaceAll('"', '""') +
    '"';
await writeFile(
  'results/run-summary.csv',
  [keys.join(','), ...rows.map((row) => keys.map((key) => csv(row[key])).join(','))].join('\n') +
    '\n',
);
console.log(`Summarized ${rows.length} cases/attempts`);
