import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import os from 'node:os';
import { readDRMClients, clientDeltas } from './drm-stats.mjs';
const execute = promisify(execFile);

// All absent counters stay null. Driver memory, browser JS heap, and application
// buffer accounting are different measurements and must never be added together.
export async function startTelemetry(label, intervalMs = 500) {
  const startedAt = new Date().toISOString(),
    start = performance.now();
  const directory = `results/runs/${startedAt.replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}-${label}`;
  await mkdir(directory, { recursive: true });
  const samples = [],
    warnings = [],
    gpuPaths = [];
  let nvidia = false,
    nvidiaSample = null,
    nvidiaTime = -Infinity;
  let ticksPerSecond = null;
  try {
    ticksPerSecond = Number((await execute('getconf', ['CLK_TCK'])).stdout.trim());
  } catch {
    warnings.push('Process-tree CPU tick frequency unavailable');
  }
  try {
    for (const card of await readdir('/sys/class/drm'))
      if (/^card\d+$/.test(card)) {
        const path = `/sys/class/drm/${card}/device`;
        try {
          await readFile(`${path}/gpu_busy_percent`);
          gpuPaths.push({ card, path });
        } catch {}
      }
  } catch {}
  try {
    await access('/dev/nvidiactl');
    await execute('nvidia-smi', ['--query-gpu=index', '--format=csv,noheader'], { timeout: 2000 });
    nvidia = true;
  } catch {}
  if (!gpuPaths.length && !nvidia)
    warnings.push(
      'No readable GPU utilization/VRAM counters. Null means unavailable, not zero utilization.',
    );
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const initialCPU = process.cpuUsage();
  let previousCPU = initialCPU,
    previousTime = start,
    previousTree = new Map();
  let previousDRM = new Map(),
    previousDRMTime = null;
  async function sample() {
    const now = performance.now(),
      cpu = process.cpuUsage(),
      memory = process.memoryUsage();
    const processTable = new Map();
    try {
      const pids = (await readdir('/proc')).filter((x) => /^\d+$/.test(x));
      // Tiny procfs reads are synchronous in this external runner to avoid
      // hundreds of thread-pool jobs. Read memory only for the benchmark process tree.
      for (const pid of pids) {
        try {
          const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
          const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
          processTable.set(Number(pid), {
            ppid: Number(fields[1]),
            ticks: Number(fields[11]) + Number(fields[12]),
            start: fields[19],
          });
        } catch {}
      }
    } catch {}
    const descendants = new Set([process.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [pid, entry] of processTable)
        if (!descendants.has(pid) && descendants.has(entry.ppid)) {
          descendants.add(pid);
          changed = true;
        }
    }
    let treeRSS = 0,
      treeTickDelta = 0;
    const currentTree = new Map();
    for (const pid of descendants) {
      const entry = processTable.get(pid);
      if (!entry) continue;
      try {
        entry.rssBytes =
          Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) *
          1024;
      } catch {
        continue;
      }
      currentTree.set(pid, entry);
      treeRSS += entry.rssBytes;
      const old = previousTree.get(pid);
      if (old?.start === entry.start) treeTickDelta += Math.max(0, entry.ticks - old.ticks);
    }
    const drmTime = performance.now();
    const drmClients = clientDeltas(
      await readDRMClients(descendants),
      previousDRM,
      previousDRMTime === null ? 0 : drmTime - previousDRMTime,
    );
    previousDRM = drmClients;
    previousDRMTime = drmTime;
    const gpu = [];
    for (const { card, path } of gpuPaths) {
      const number = async (file) => {
        try {
          return Number((await readFile(`${path}/${file}`, 'utf8')).trim());
        } catch {
          return null;
        }
      };
      gpu.push({
        card,
        busyPercent: await number('gpu_busy_percent'),
        vramUsedBytes: await number('mem_info_vram_used'),
        vramTotalBytes: await number('mem_info_vram_total'),
        scope: 'whole device, includes unrelated applications',
      });
    }
    if (nvidia) {
      if (now - nvidiaTime >= 1000) {
        try {
          const { stdout } = await execute(
            'nvidia-smi',
            [
              '--query-gpu=index,utilization.gpu,memory.used,memory.total',
              '--format=csv,noheader,nounits',
            ],
            { timeout: 2000 },
          );
          nvidiaSample = stdout
            .trim()
            .split('\n')
            .map((line) => {
              const values = line.split(',').map((x) => Number(x.trim())),
                valid = (x) => (Number.isFinite(x) ? x : null);
              return {
                card: `nvidia-${values[0]}`,
                busyPercent: valid(values[1]),
                vramUsedBytes: valid(values[2] * 1048576),
                vramTotalBytes: valid(values[3] * 1048576),
                scope: 'whole device, includes unrelated applications',
              };
            });
          nvidiaTime = now;
        } catch (error) {
          warnings.push(`GPU counter sampling stopped: ${String(error)}`);
          nvidia = false;
        }
      }
      if (nvidiaSample)
        gpu.push(...nvidiaSample.map((x) => ({ ...x, sampleAgeMs: now - nvidiaTime })));
    }
    samples.push({
      elapsedMs: now - start,
      process: {
        ...memory,
        cpuPercentOneCore:
          (cpu.user - previousCPU.user + cpu.system - previousCPU.system) /
          ((now - previousTime) * 10),
      },
      tree: {
        processes: currentTree.size,
        summedRssBytes: currentTree.size ? treeRSS : null,
        cpuPercentOneCore:
          previousTree.size && ticksPerSecond
            ? (treeTickDelta / ticksPerSecond / ((now - previousTime) / 1000)) * 100
            : null,
      },
      system: { freeMemoryBytes: os.freemem(), loadAverage: os.loadavg() },
      gpu: gpu.length ? gpu : null,
      drmClients: drmClients.size ? [...drmClients.values()] : null,
      samplerWorkMs: performance.now() - now,
    });
    previousTree = currentTree;
    previousCPU = cpu;
    previousTime = now;
  }
  let pending = Promise.resolve();
  await sample();
  const timer = setInterval(() => {
    pending = pending.then(sample).catch((e) => warnings.push(String(e)));
  }, intervalMs);
  timer.unref();
  return {
    directory,
    async stop(details = {}) {
      clearInterval(timer);
      await pending;
      await sample();
      delay.disable();
      const elapsedMs = performance.now() - start,
        cpu = process.cpuUsage(initialCPU);
      const report = {
        label,
        startedAt,
        elapsedMs,
        intervalMs,
        status: details.status ?? 'complete',
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        node: process.version,
        cpuModel: os.cpus()[0]?.model,
        logicalCPUs: os.cpus().length,
        totalSystemMemoryBytes: os.totalmem(),
        ticksPerSecond,
        cpuTimeUs: cpu,
        resourceUsage: process.resourceUsage(),
        eventLoopDelayMs: {
          median: delay.percentile(50) / 1e6,
          p95: delay.percentile(95) / 1e6,
          p99: delay.percentile(99) / 1e6,
        },
        peakSampledRSSBytes: Math.max(...samples.map((x) => x.process.rss)),
        peakSampledHeapUsedBytes: Math.max(...samples.map((x) => x.process.heapUsed)),
        peakSampledTreeRSSBytes:
          Math.max(...samples.map((x) => x.tree.summedRssBytes ?? 0)) || null,
        gpuCounters:
          gpuPaths.length || nvidiaSample ? 'sysfs and/or nvidia-smi; whole-device scope' : null,
        warnings,
        details,
        notes: [
          'CPU 100% means one logical core. Node memory counters describe this runner, not browser JS heaps.',
          'Summed process-tree RSS can double count shared pages. Processes that exit between samples can be missed.',
          'GPU buffer bytes must come from the workload; they exclude driver allocations.',
          'Sampling runs concurrently and introduces overhead. Compare equally instrumented runs.',
          'Event-loop delay is scheduling delay, not input-to-photon latency.',
          'Device-wide NVIDIA counters do not measure Intel activity. DRM clients cover only this process tree, deduplicated by device/client ID. Engine 100% means one engine, not whole-GPU utilization. Missing counters remain null.',
          'DRM memory categories overlap; shared allocations may appear in several clients. Do not add categories or equate system memory with dedicated VRAM.',
        ],
        samples,
      };
      await writeFile(`${directory}/telemetry.json`, JSON.stringify(report, null, 2) + '\n');
      return report;
    },
  };
}
