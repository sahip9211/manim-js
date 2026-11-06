import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

export async function serve(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') {
        res.writeHead(302, { Location: '/lab/index.html' + url.search }).end();
        return;
      }
      const filename = resolve(root, '.' + (pathname === '/' ? '/lab/index.html' : pathname));
      if (!filename.startsWith(root.endsWith(sep) ? root : root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(filename);
      res
        .writeHead(200, {
          'Content-Type': types[extname(filename)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        })
        .end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serve(Number(process.env.PORT ?? 4173));
  console.log(`ManimJS rendering lab: ${url}`);
}
