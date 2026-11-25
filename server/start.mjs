import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRooms, ROOM_ENDPOINT } from './rooms.mjs';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const appPath = /^\/(?:editor(?:\/[0-9a-f-]{36})?|decks|sign-in|auth\/callback)?\/?$/i;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === ROOM_ENDPOINT) {
      response.writeHead(426, { Upgrade: 'websocket' }).end();
      return;
    }
    const file = resolve(root, '.' + (appPath.test(pathname) ? '/index.html' : pathname));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (request.method === 'HEAD') response.end();
    else
      createReadStream(file)
        .on('error', () => response.destroy())
        .pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
attachRooms(server);
server.on('upgrade', (request, socket) => {
  if (request.url?.split('?')[0] !== ROOM_ENDPOINT) socket.destroy();
});
server.listen(Number(process.env.PORT || 4173), process.env.FORMA_HOST || '0.0.0.0', () => {
  console.log('Forma is listening at port ' + server.address().port);
});
