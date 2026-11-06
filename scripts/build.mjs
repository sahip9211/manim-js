import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';

await mkdir('dist', { recursive: true });
const license = (await readFile('LICENSE', 'utf8')).replace(
  'Copyright (c) 2026 ManimJS contributors',
  'Copyright (c) 2026 ManimJS contributors\nCopyright (c) 2020-2026 3Blue1Brown LLC (adapted surface shading and projection)',
);
const outputs = [];
for (const [format, outfile] of [
  ['iife', 'dist/manim.js'],
  ['esm', 'dist/manim.module.js'],
]) {
  const result = await build({
    entryPoints: ['src/index.js'],
    bundle: true,
    splitting: false,
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    format,
    ...(format === 'iife' ? { globalName: 'ManimJS' } : {}),
    outfile,
    metafile: true,
    banner: { js: `/*! ManimJS — experimental mathematical graphics.\n${license}*/` },
  });
  for (const [path, output] of Object.entries(result.metafile.outputs)) {
    if (output.imports.length) throw new Error(`Standalone build has external imports: ${path}`);
  }
  const bytes = await readFile(outfile);
  outputs.push({
    path: outfile,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    brotliBytes: brotliCompressSync(bytes).length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    inputs: Object.keys(result.metafile.inputs),
    externalImports: 0,
  });
}
await writeFile(
  'dist/manifest.json',
  JSON.stringify({ createdAt: new Date().toISOString(), outputs }, null, 2) + '\n',
);
console.log(
  outputs
    .map((x) => `${x.path}: ${x.bytes} bytes, ${x.gzipBytes} gzip, ${x.brotliBytes} brotli`)
    .join('\n'),
);
