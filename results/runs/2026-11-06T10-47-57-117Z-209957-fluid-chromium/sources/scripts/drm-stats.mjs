import { readdir, readFile, readlink } from 'node:fs/promises';

// Kernel format: https://www.kernel.org/doc/html/next/gpu/drm-usage-stats.html
export function parseDRMInfo(text) {
  const fields = Object.fromEntries(text.split('\n').filter(line => line.includes(':')).map(line => {
    const i = line.indexOf(':'); return [line.slice(0, i), line.slice(i + 1).trim()];
  }));
  if (!fields['drm-client-id'] || !fields['drm-driver']) return null;
  const engines = {}, memoryBytes = {};
  for (const [key, value] of Object.entries(fields)) {
    const time = value.match(/^(\d+) ns$/);
    if (key.startsWith('drm-engine-') && time) {
      const name = key.slice(11);
      engines[name] = { busyNs: Number(time[1]), capacity: Number(fields[`drm-engine-capacity-${name}`] ?? 1) };
    }
    if (/^drm-(total|shared|active|resident|purgeable)-/.test(key)) {
      const size = value.match(/^(\d+)(?: (KiB|MiB|GiB))?$/);
      if (size) memoryBytes[key.slice(4)] = Number(size[1]) * ({ KiB: 1024, MiB: 1048576, GiB: 1073741824 }[size[2]] ?? 1);
    }
  }
  return { driver: fields['drm-driver'], device: fields['drm-pdev'] ?? null, clientID: fields['drm-client-id'], engines, memoryBytes };
}

export function clientDeltas(clients, previous, elapsedMs) {
  const unique = new Map();
  for (const client of clients) {
    // IDs are device-scoped. Same client can appear through duplicated FDs or
    // several related processes; count it once. PID scopes non-PCI fallback.
    const key = `${client.device ?? `pid:${client.pid}`}/${client.driver}/${client.clientID}`;
    if (unique.has(key)) continue;
    const old = previous.get(key);
    const engines = Object.fromEntries(Object.entries(client.engines).map(([name, engine]) => {
      const before = old?.engines[name]?.busyNs;
      return [name, { ...engine, busyPercentOneEngine: before !== undefined && engine.busyNs >= before && elapsedMs > 0 ? (engine.busyNs - before) / (elapsedMs * 1e6) * 100 : null }];
    }));
    unique.set(key, { ...client, engines });
  }
  return unique;
}

export async function readDRMClients(pids) {
  const clients = [];
  await Promise.all([...pids].map(async pid => {
    let fds;
    try { fds = await readdir(`/proc/${pid}/fd`); } catch { return; }
    await Promise.all(fds.map(async fd => {
      try {
        if (!(await readlink(`/proc/${pid}/fd/${fd}`)).startsWith('/dev/dri/')) return;
        const client = parseDRMInfo(await readFile(`/proc/${pid}/fdinfo/${fd}`, 'utf8'));
        if (client) clients.push({ pid, ...client });
      } catch {} // Processes/FDs can disappear during a sample.
    }));
  }));
  return clients;
}
