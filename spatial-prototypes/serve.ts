import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshots } from './snapshots.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const candidate = process.argv[2] ?? 'atlas';
const ports: Record<string, number> = { atlas: 5181, hyperbolic: 5182, icicle: 5183, 'hyperbolic-skeleton': 5184, 'hyperbolic-foveated': 5185, wildcard: 5186 };
if (!ports[candidate]) throw new Error('Choose atlas, hyperbolic, icicle, hyperbolic-skeleton, hyperbolic-foveated or wildcard.');
const port = Number(process.env.PROTOTYPE_PORT ?? ports[candidate]);
const files = new Map<string, { type: string; body: Buffer | string }>();
for (const snapshot of snapshots) {
  const body = readFileSync(path.join(root, '.snapshots', `${snapshot.id}.json`));
  if (createHash('sha256').update(body).digest('hex') !== snapshot.sha256) throw new Error(`Snapshot changed: ${snapshot.id}`);
  files.set(`/snapshots/${snapshot.id}.json`, { type: 'application/json', body });
}
const bundle = await build({ entryPoints: [path.join(root, 'main.ts')], bundle: true,
  write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'warning' });
const output = bundle.outputFiles[0];
if (!output) throw new Error('Prototype build produced no JavaScript.');
files.set('/app.js', { type: 'text/javascript', body: Buffer.from(output.contents) });
files.set('/style.css', { type: 'text/css', body: readFileSync(path.join(root, 'style.css')) });
const lensBundle = await build({ entryPoints: [path.join(root, 'peneira2/main.ts')], bundle: true,
  write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'warning' });
const lensOutput = lensBundle.outputFiles[0];
if (!lensOutput) throw new Error('Lens build produced no JavaScript');
files.set('/peneira2.js', { type: 'text/javascript', body: Buffer.from(lensOutput.contents) });
files.set('/peneira2.css', { type: 'text/css', body: readFileSync(path.join(root, 'peneira2/style.css')) });
files.set('/', { type: 'text/html', body: '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spatial prototypes · Peneira 1</title><link rel="stylesheet" href="/style.css"><div id="app"></div><script type="module" src="/app.js"></script></html>' });
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/' && ['hyperbolic-skeleton', 'hyperbolic-foveated', 'wildcard'].includes(url.searchParams.get('candidate') ?? '')) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Cache-Control', 'no-store');
    response.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spatial lenses · Peneira 2</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/peneira2.css"><div id="app"></div><script type="module" src="/peneira2.js"></script></html>'); return;
  }
  const file = files.get(url.pathname);
  if (!file) { response.writeHead(404).end('Not found'); return; }
  response.setHeader('Content-Type', `${file.type}; charset=utf-8`);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(file.body);
});
server.listen(port, '127.0.0.1', () => console.log(`Spatial prototypes: http://127.0.0.1:${port}/?candidate=${candidate}&project=bc\nCtrl+C stops. Restart after source edits.`));
