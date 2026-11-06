import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDRMInfo, clientDeltas } from '../scripts/lib/drm-stats.mjs';

test('DRM statistics preserve units, identify clients and deduplicate shared FDs', () => {
  const text =
    'drm-driver: i915\ndrm-pdev: 0000:00:02.0\ndrm-client-id: 7\ndrm-engine-render: 200000000 ns\ndrm-engine-capacity-render: 2\ndrm-total-system0: 12 KiB\ndrm-shared-system0: 1 MiB';
  const client = { pid: 10, ...parseDRMInfo(text) };
  assert.equal(client.device, '0000:00:02.0');
  assert.equal(client.memoryBytes['total-system0'], 12288);
  assert.equal(client.memoryBytes['shared-system0'], 1048576);
  const first = clientDeltas([client, { ...client, pid: 11 }], new Map(), 500);
  assert.equal(first.size, 1);
  assert.equal([...first.values()][0].engines.render.busyPercentOneEngine, null);
  const later = { ...client, engines: { render: { busyNs: 450000000, capacity: 2 } } };
  const next = [...clientDeltas([later], first, 500).values()][0];
  assert.equal(next.engines.render.busyPercentOneEngine, 50);
  assert.equal(next.engines.render.capacity, 2);
  assert.equal(parseDRMInfo('pos: 0\nflags: 02'), null);
  assert.equal(
    [...clientDeltas([client], new Map([['0000:00:02.0/i915/7', later]]), 500).values()][0].engines
      .render.busyPercentOneEngine,
    null,
  );
});
