import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const names = [
  'manimgl',
  'threejs',
  'pixijs',
  'motion-canvas',
  'regl',
  'manim-web',
  'vello',
  'meshoptimizer',
];
const repositories = [];
const execute = promisify(execFile);
for (const name of names) {
  const directory = `vendor/${name}`;
  const git = async (args) =>
    (await execute('git', ['-C', directory, ...args], { encoding: 'utf8' })).stdout.trim();
  const licenses = [];
  for (const file of await readdir(directory))
    if (/^(LICENSE|COPYING)/i.test(file)) {
      licenses.push({
        path: file,
        sha256: createHash('sha256')
          .update(await readFile(`${directory}/${file}`))
          .digest('hex'),
      });
    }
  repositories.push({
    directory,
    remote: await git(['remote', 'get-url', 'origin']),
    commit: await git(['rev-parse', 'HEAD']),
    date: await git(['log', '-1', '--format=%cs']),
    licenses,
  });
}
await writeFile(
  'docs/reference-revisions.json',
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      note: 'Research inputs only; vendor/ is gitignored. No upstream implementation is linked into the ManimJS build.',
      repositories,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Recorded ${repositories.length} reference revisions`);
