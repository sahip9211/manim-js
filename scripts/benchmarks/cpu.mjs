import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { makeGrid, cpuUpdates, shuffled, summarize } from '../../experiments/grid/model.js';

const sizes = [32, 128, 512, 1024];
const rounds = 5;
const batches = 15;
const results = [];
let checksum = 0;
for (let round = 0; round < rounds; round++) {
  const cases = sizes.flatMap((size) =>
    Object.keys(cpuUpdates).map((strategy) => ({ size, strategy })),
  );
  for (const { size, strategy } of shuffled(cases, 1729 + round)) {
    const grid = makeGrid(size);
    const update = cpuUpdates[strategy];
    for (let i = 0; i < 60; i++) update(grid, i * 0.02, 0.25);
    const calibrationStart = performance.now();
    for (let i = 0; i < 8; i++) update(grid, i * 0.02, 0.25);
    const one = (performance.now() - calibrationStart) / 8;
    const iterations = Math.max(1, Math.min(4096, Math.ceil(6 / Math.max(one, 0.001))));
    const samples = [];
    for (let batch = 0; batch < batches; batch++) {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) update(grid, (batch * iterations + i) * 0.013, 0.25);
      samples.push((performance.now() - start) / iterations);
      checksum += grid.output[(batch * 14) % grid.output.length];
    }
    results.push({
      round,
      size,
      strategy,
      vertices: grid.count,
      iterations,
      samplesMs: samples,
      msPerUpdate: summarize(samples),
      outputBytes: grid.output.byteLength,
    });
    console.log(
      `${round + 1}/${rounds} ${size} ${strategy}: ${summarize(samples).median.toFixed(4)} ms/update`,
    );
  }
}
await mkdir('results', { recursive: true });
await writeFile(
  'results/cpu.json',
  JSON.stringify(
    {
      experiment: '001-grid-deformation',
      scope: 'Node/V8 CPU only; no rendering, uploads, GPU, or browser frame time',
      createdAt: new Date().toISOString(),
      runtime: process.version,
      v8: process.versions.v8,
      platform: platform(),
      os: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      rounds,
      batches,
      warmupIterations: 60,
      timer: 'performance.now, amortized batches targeting 6 ms',
      seed: 1729,
      checksum,
      results,
    },
    null,
    2,
  ) + '\n',
);
