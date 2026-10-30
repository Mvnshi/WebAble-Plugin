/**
 * Zero-dependency static server for the test harness. Serves the demo pages
 * (examples/test-site) and the built widget assets (public) from one origin, so
 * `/widget.js` and `/webable/boot.js` resolve exactly as they would in
 * production. Run: npm run demo  (builds the widget first, then serves).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = [join(root, 'examples/test-site'), join(root, 'dist')];
const PORT = Number(process.env.PORT || 5050);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  rel = rel.replace(/^\/+/, '');
  for (const base of ROOTS) {
    const file = join(base, rel);
    if (!file.startsWith(base)) continue; // path traversal guard
    try {
      const s = await stat(file);
      if (s.isFile()) return file;
    } catch {
      /* try next root */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, () => {
  console.log(`WebAble test harness → http://localhost:${PORT}/`);
});
