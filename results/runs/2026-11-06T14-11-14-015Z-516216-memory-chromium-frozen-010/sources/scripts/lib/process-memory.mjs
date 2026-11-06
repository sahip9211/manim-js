import { readFileSync, readdirSync } from 'node:fs';

export function parseSmapsRollup(text) {
  const fields = Object.fromEntries(
    [...text.matchAll(/^(\w+):\s+(\d+) kB$/gm)].map(([, key, value]) => [
      key,
      Number(value) * 1024,
    ]),
  );
  return {
    rssBytes: fields.Rss ?? null,
    pssBytes: fields.Pss ?? null,
    privateBytes:
      fields.Private_Clean !== undefined && fields.Private_Dirty !== undefined
        ? fields.Private_Clean + fields.Private_Dirty + (fields.Private_Hugetlb ?? 0)
        : null,
    swapPssBytes: fields.SwapPss ?? null,
  };
}

// Read only the runner and its descendants; never record command lines or environments.
export function processMemorySnapshot() {
  const table = new Map();
  for (const pid of readdirSync('/proc').filter((x) => /^\d+$/.test(x)))
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const end = stat.lastIndexOf(')');
      const parts = stat.slice(end + 2).split(' ');
      table.set(Number(pid), {
        pid: Number(pid),
        ppid: Number(parts[1]),
        name: stat.slice(stat.indexOf('(') + 1, end),
      });
    } catch {}
  const selected = new Set([process.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, p] of table)
      if (!selected.has(pid) && selected.has(p.ppid)) {
        selected.add(pid);
        changed = true;
      }
  }
  const processes = [];
  for (const pid of selected) {
    const row = { ...table.get(pid), runner: pid === process.pid };
    try {
      Object.assign(row, parseSmapsRollup(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8')));
    } catch {
      row.unavailable = true;
      try {
        row.rssBytes =
          Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1]) * 1024;
      } catch {}
    }
    processes.push(row);
  }
  const aggregate = (rows) =>
    Object.fromEntries(
      ['rssBytes', 'pssBytes', 'privateBytes', 'swapPssBytes'].map((key) => {
        const values = rows.map((r) => r[key]);
        return [key, values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null];
      }),
    );
  return {
    createdAt: new Date().toISOString(),
    processes,
    tree: aggregate(processes),
    browser: aggregate(processes.filter((p) => !p.runner)),
    coverage: {
      total: processes.length,
      readableSmaps: processes.filter((p) => !p.unavailable).length,
    },
  };
}
