import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const demoRoot = fileURLToPath(new URL('.', import.meta.url));
const siteRoot = resolve(demoRoot, 'dist-portable');
const host = '127.0.0.1';
const port = 4173;
const url = `http://localhost:${port}/`;
const noOpen = process.argv.includes('--no-open');

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

if (!existsSync(join(siteRoot, 'index.html'))) {
  throw new Error('Cannot find dist-portable/index.html.');
}

function safeFile(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0]);
  } catch {
    return { error: 400 };
  }
  const relative = normalize(decoded.replace(/^([/\\])+/, '')) || 'index.html';
  const candidate = resolve(siteRoot, relative);
  if (candidate !== siteRoot && !candidate.startsWith(`${siteRoot}${sep}`)) return { error: 403 };
  if (existsSync(candidate) && statSync(candidate).isFile()) return { file: candidate };
  return { file: join(siteRoot, 'index.html') };
}

const server = createServer((request, response) => {
  const result = safeFile(request.url ?? '/');
  if ('error' in result) {
    response.writeHead(result.error).end(result.error === 400 ? 'Bad Request' : 'Forbidden');
    return;
  }
  const file = result.file;
  response.writeHead(200, {
    'Content-Type': mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!response.headersSent) response.writeHead(500);
    response.end('Read error');
  });
  stream.pipe(response);
});

server.on('error', (error) => {
  console.error(`Demo server error: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Underwater Report Builder: ${url}`);
  console.log('Close this window to stop the demo.');
  if (!noOpen) execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true });
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
