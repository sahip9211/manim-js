import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export async function snapshotSources(directory, files) {
  const hashes = {};
  for (const file of files) {
    const body = await readFile(file), destination = `${directory}/sources/${file}`;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, body); hashes[file] = createHash('sha256').update(body).digest('hex');
  }
  await writeFile(`${directory}/source-hashes.json`, JSON.stringify(hashes, null, 2) + '\n');
  return hashes;
}
