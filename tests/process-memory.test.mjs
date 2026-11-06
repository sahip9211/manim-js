import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSmapsRollup } from '../scripts/lib/process-memory.mjs';

test('process memory distinguishes proportional, resident and private pages', () => {
  assert.deepEqual(
    parseSmapsRollup(
      'Rss: 900 kB\nPss: 500 kB\nPrivate_Clean: 100 kB\nPrivate_Dirty: 200 kB\nPrivate_Hugetlb: 2 kB\nSwapPss: 5 kB\n',
    ),
    {
      rssBytes: 900 * 1024,
      pssBytes: 500 * 1024,
      privateBytes: 302 * 1024,
      swapPssBytes: 5 * 1024,
    },
  );
  assert.equal(parseSmapsRollup('Rss: 9 kB\n').pssBytes, null);
  assert.equal(parseSmapsRollup('Rss: 9 kB\n').privateBytes, null);
});
