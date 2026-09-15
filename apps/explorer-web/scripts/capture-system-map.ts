import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import { generateExplorerSnapshot } from './explorer-development-target.js';

// Each step is +regionId (refine), -regionId (collapse), =itemId (inspect),
// or @system (fit the whole map). Snapshots and captures stay in the output directory.
const [target, output, ...steps] = process.argv.slice(2);
if (!target || !output) throw new Error('Usage: capture-system-map.ts <target> <output-directory> [+regionId|-regionId|=itemId|@system ...]');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const outputDirectory = path.resolve(output);
mkdirSync(outputDirectory, { recursive: true });
const snapshot = generateExplorerSnapshot({
  args: [target], cwd: process.cwd(), defaultTarget: repoRoot,
  outputPath: path.join(outputDirectory, 'snapshot.json'),
});
const entry = path.join(outputDirectory, 'entry.tsx');
writeFileSync(entry, `
  import { createRoot } from 'react-dom/client';
  import { Explorer } from ${JSON.stringify(path.join(appRoot, 'src/explorer-app.tsx'))};
  import { createExplorerRuntime } from ${JSON.stringify(path.join(appRoot, 'src/explorer-runtime.ts'))};
  import ${JSON.stringify(path.join(appRoot, 'node_modules/@xyflow/react/dist/style.css'))};
  import ${JSON.stringify(path.join(appRoot, 'src/styles.css'))};
  const snapshot = await fetch('/snapshot.json').then(response => response.json());
  const runtime = createExplorerRuntime(snapshot);
  if (runtime.kind !== 'ready') throw new Error('Snapshot could not be reconstructed');
  createRoot(document.getElementById('root')).render(<Explorer graph={runtime.graph} structure={runtime.structure} responsibilities={runtime.responsibilities} projectLabel={runtime.projectLabel} />);
`);
await build({ entryPoints: [entry], outfile: path.join(outputDirectory, 'map.js'),
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  nodePaths: [path.join(appRoot, 'node_modules')], logLevel: 'silent' });
writeFileSync(path.join(outputDirectory, 'index.html'), '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/map.css"></head><body><div id="root"></div><script type="module" src="/map.js"></script></body></html>');
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const filePath = path.resolve(outputDirectory, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!filePath.startsWith(outputDirectory + path.sep)) return void response.writeHead(403).end();
  try {
    response.setHeader('Content-Type', filePath.endsWith('.js') ? 'text/javascript' : filePath.endsWith('.css') ? 'text/css' : filePath.endsWith('.json') ? 'application/json' : 'text/html');
    response.end(readFileSync(filePath));
  } catch { response.writeHead(404).end(); }
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Capture server has no port');
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: process.env.BUNKERCODE_BROWSER_EXECUTABLE ?? '/usr/bin/firefox', headless: true });
const measurements = [];
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle0' });
  for (const [index, step] of ['initial', ...steps].entries()) {
    const id = step.slice(1);
    if (step.startsWith('+')) {
      await page.click(`[data-system-map-refine="${id}"]`);
      await page.waitForSelector(`[data-system-map-context-frame="${id}"]`);
    } else if (step.startsWith('-')) {
      await page.click(`[data-system-map-collapse="${id}"]`);
      await page.waitForSelector(`[data-system-map-item-id="${id}"]`);
    } else if (step.startsWith('=')) {
      await page.click(`[data-system-map-item-id="${id}"] .system-map-landmark-select`);
      await page.waitForSelector('[data-system-map-field-inspector]');
    } else if (step === '@system') {
      await page.click('[aria-label="Map scale"] > button');
    } else if (step !== 'initial') throw new Error(`Unknown capture step: ${step}`);
    await page.waitForSelector('[data-map-camera-ready="true"]');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const name = `${index}-${step.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    await page.screenshot({ path: path.join(outputDirectory, `${name}.png`), fullPage: true });
    measurements.push(await page.evaluate((state) => ({
      state,
      viewport: document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform,
      inspector: Boolean(document.querySelector('[data-system-map-field-inspector]')),
      visibleEdges: document.querySelectorAll('.react-flow__edge').length,
      landmarks: [...document.querySelectorAll<HTMLElement>('[data-system-map-item-id], [data-system-map-context-frame]')].map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.dataset.systemMapItemId ?? element.dataset.systemMapContextFrame,
          parent: element.dataset.systemMapParentFrame, kind: element.dataset.systemMapFrameKind ?? element.dataset.systemMapItemKind,
          x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    }), step));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(path.join(outputDirectory, 'measurements.json'), JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify({ project: snapshot.projectLabel, captures: measurements.length, outputDirectory }));
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
