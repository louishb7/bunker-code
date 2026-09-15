import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const repoRoot = path.resolve('.');
const appRoot = path.join(repoRoot, 'apps', 'explorer-web');
const firefoxExecutablePath = process.env.BUNKERCODE_BROWSER_EXECUTABLE ?? '/usr/bin/firefox';

async function systemMapBoxes(page: import('puppeteer-core').Page) {
  return page.$$eval('[data-system-map-item-id], [data-system-map-context-frame]', (elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { id: element.getAttribute('data-system-map-item-id') ?? `context:${element.getAttribute('data-system-map-context-frame')}`,
      parentId: element.getAttribute('data-system-map-parent-frame'), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
}

async function assertSystemMapContainment(page: import('puppeteer-core').Page) {
  const boxes = await systemMapBoxes(page);
  for (const box of boxes) {
    if (!box.parentId) continue;
    const parent = boxes.find((candidate) => candidate.id === box.parentId);
    assert.ok(parent, `Missing visual parent for ${box.id}`);
    assert.ok(box.x > parent.x && box.y > parent.y, `${box.id} starts inside ${parent.id}`);
    assert.ok(box.x + box.width < parent.x + parent.width, `${box.id} fits parent width`);
    assert.ok(box.y + box.height < parent.y + parent.height, `${box.id} fits parent height`);
  }
  for (const id of ['directory:apps', 'directory:test']) {
    const box = boxes.find((candidate) => candidate.id === id);
    if (box) assert.equal(box.parentId, '');
  }
}

async function captureSystemMap(page: import('puppeteer-core').Page, state: string) {
  if (process.env.BUNKERCODE_CAPTURE_VISUAL !== '1') return;
  await page.screenshot({ path: `/tmp/bunkercode-multiscale-${state}.png`, fullPage: true });
}

test('Explorer presents the initial structural frontier in a real browser', { timeout: 90000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== '1') {
    t.skip('Set BUNKERCODE_BROWSER_TEST=1 to run the Firefox Explorer smoke test.');
    return;
  }
  if (!existsSync(firefoxExecutablePath)) throw new Error(`Firefox executable not found: ${firefoxExecutablePath}`);

  const harnessRoot = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-system-map-browser-'));
  t.after(() => rmSync(harnessRoot, { recursive: true, force: true }));
  const distDirectory = await buildResponsibilityHarness(harnessRoot);
  const server = previewServer(distDirectory);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('System Map harness did not expose a TCP address.');
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: firefoxExecutablePath, headless: true });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-system-map-status="ready"]', { timeout: 15000 });

    assert.equal(await page.$eval('[data-surface="overview"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-system-map-item-count')), '4');
    assert.equal(await page.$$eval('[data-system-map-item-kind="file"]', (items) => items.length), 4);
    await page.click('[data-system-map-item-kind="file"] button');
    await page.waitForSelector('[data-system-map-field-inspector="src/prisma.service.ts"]', { timeout: 5000 });
    assert.equal(await page.$eval('[data-system-map-field-inspector]', (element) => element.textContent?.includes('Structural connections')), true);
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-system-map-item-count')), '4');
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Explorer navigates factual territories and focused file relationships in a real browser', { timeout: 90000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== '1') {
    t.skip('Set BUNKERCODE_BROWSER_TEST=1 to run the Firefox Explorer smoke test.');
    return;
  }
  if (!existsSync(firefoxExecutablePath)) throw new Error(`Firefox executable not found: ${firefoxExecutablePath}`);

  execFileSync('pnpm', ['--filter', '@bunker-code/explorer-web', 'build'], { cwd: repoRoot, stdio: 'pipe' });
  const snapshot = JSON.parse(readFileSync(path.join(appRoot, 'src/generated/analyzer-typescript.snapshot.json'), 'utf8')) as { responsibilities: unknown; analysis: { files: unknown[] } };
  assert.ok(snapshot.responsibilities);
  const server = previewServer(path.join(appRoot, 'dist'));
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Explorer preview server did not expose a TCP address.');
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: firefoxExecutablePath, headless: true });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-system-map-status="ready"]', { timeout: 15000 });
    assert.equal(await page.$eval('[data-surface="overview"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[data-surface="responsibility"]', (element) => (element as HTMLButtonElement).disabled), true);
    assert.equal(await page.$eval('[data-surface="territory"]', (element) => (element as HTMLButtonElement).disabled), false);
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-system-map-item-count')), '3');
    assert.equal(await page.$eval('[data-system-map]', (element) => Number((element as HTMLElement).dataset.systemMapRelationCount) > 0), true);
    assert.equal(await page.$eval('[data-system-map]', (element) => Number((element as HTMLElement).dataset.systemMapDependencyCount) > 0), true);
    assert.equal(await page.$eval('[data-system-map]', (element) => element.textContent?.includes('No src Territory was observed')), false);
    assert.ok(await page.$('[data-system-map-item-id="directory:apps"]'));
    assert.ok(await page.$('[data-system-map-item-id="directory:packages"]'));
    assert.ok(await page.$('[data-system-map-item-id="directory:test"]'));
    assert.ok(await page.$('.system-map-canvas .react-flow'));
    const initialPositions = await systemMapBoxes(page);
    assert.equal(await page.$$eval('[data-system-map-context-frame]', (frames) => frames.length), 0);
    await captureSystemMap(page, 'initial');
    await page.click('[data-system-map-item-id="directory:apps"] button');
    await clickButton(page, 'Explore region');
    await page.waitForSelector('[data-system-map-context-frame="directory:apps"]');
    await assertSystemMapContainment(page);
    for (const id of ['directory:apps/cli', 'directory:apps/explorer-web']) {
      assert.equal(await page.$eval(`[data-system-map-item-id="${id}"]`, (element) => element.getAttribute('data-system-map-parent-frame')), 'context:directory:apps');
    }
    await captureSystemMap(page, 'apps');
    await page.click('[aria-label="Collapse apps"]');
    await page.waitForSelector('[data-system-map-item-id="directory:apps"]');
    assert.equal(await page.$eval('[data-primary-explorer-surface]', (element) => element.getBoundingClientRect().top <= 220), true);
    await page.click('[data-system-map-item-id="directory:packages"] button');
    await page.waitForSelector('[data-system-map-field-inspector="directory:packages"]', { timeout: 5000 });
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-system-map-item-count')), '3');
    await clickButton(page, 'Explore region');
    await page.waitForSelector('[data-system-map-item-id="directory:packages/graph-engine"]', { timeout: 5000 });
    assert.ok(await page.$('[data-system-map-item-id="directory:apps"]'));
    assert.ok(await page.$('[data-system-map-item-id="directory:test"]'));
    assert.ok(await page.$('[data-system-map-item-id="directory:packages/analyzer-typescript"]'));
    assert.ok(await page.$('[data-system-map-item-id="directory:packages/contracts"]'));
    await assertSystemMapContainment(page);
    const packagesPositions = await systemMapBoxes(page);
    const initialApps = initialPositions.find((box) => box.id === 'directory:apps');
    const currentApps = packagesPositions.find((box) => box.id === 'directory:apps');
    assert.ok(initialApps && currentApps);
    assert.ok(Math.abs(currentApps.x - initialApps.x) < 2 && Math.abs(currentApps.y - initialApps.y) < 2);
    const initialTest = initialPositions.find((box) => box.id === 'directory:test');
    const currentTest = packagesPositions.find((box) => box.id === 'directory:test');
    assert.ok(initialTest && currentTest);
    assert.ok(Math.abs(currentTest.y - initialTest.y) < 2);
    assert.ok(currentTest.x >= initialTest.x && currentTest.x - initialTest.x < initialTest.width);
    await captureSystemMap(page, 'packages');
    await page.click('[data-system-map-item-id="directory:packages/analyzer-typescript"] button');
    await page.click('[data-system-map-context-frame="directory:packages"] header small');
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-selected-system-map-item')), 'directory:packages/analyzer-typescript');
    await page.focus('[data-system-map-item-id="directory:packages/analyzer-typescript"] button');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-selected-system-map-item=""]');
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-selected-system-map-item')), '');
    assert.equal(await page.$('[data-system-map-field-inspector]'), null);
    await page.focus('[aria-label="Structural region @bunker-code/graph-engine"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-system-map-field-inspector="directory:packages/graph-engine"]', { timeout: 5000 });
    await clickButton(page, 'Explore region');
    await page.waitForSelector('[data-system-map-item-id="packages/graph-engine/src/project-graph.ts"]', { timeout: 5000 });
    assert.equal(await page.$('[data-system-map-item-id="directory:packages/graph-engine/src"]'), null);
    await assertSystemMapContainment(page);
    assert.equal(await page.$eval('[data-system-map-context-frame="directory:packages/graph-engine"]', (element) => element.getAttribute('data-system-map-parent-frame')), 'context:directory:packages');
    assert.equal(await page.$eval('[data-system-map-item-id="packages/graph-engine/src/project-graph.ts"]', (element) => element.getAttribute('data-system-map-parent-frame')), 'context:directory:packages/graph-engine');
    await captureSystemMap(page, 'graph-engine');
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-selected-system-map-item')), '');
    await page.click('.react-flow__edge');
    await page.waitForSelector('[data-system-map-field-relation]', { timeout: 5000 });
    await page.click('[aria-label="Collapse packages"]');
    await page.waitForSelector('[data-system-map-item-id="directory:packages"]', { timeout: 5000 });
    assert.ok(await page.$('[data-system-map-item-id="directory:apps"]'));
    assert.ok(await page.$('[data-system-map-item-id="directory:test"]'));
    assert.equal(await page.$('[data-system-map-item-id="directory:packages/graph-engine"]'), null);
    assert.equal(await page.$('[data-system-map-field-relation]'), null);
    assert.equal(await page.$eval('[data-system-map]', (element) => element.getAttribute('data-selected-system-map-item')), '');
    assert.equal(await page.$$eval('[data-system-map-context-frame]', (frames) => frames.length), 0);
    const collapsedPositions = await systemMapBoxes(page);
    for (const before of initialPositions) {
      const after = collapsedPositions.find((box) => box.id === before.id);
      assert.ok(after);
      assert.ok(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2);
    }
    await page.focus('[data-system-map-item-id="directory:test"] button');
    await page.keyboard.press('Enter');
    await clickButton(page, 'Explore region');
    await page.waitForSelector('[data-system-map-context-frame="directory:test"]');
    await assertSystemMapContainment(page);
    assert.equal(await page.$$eval('[data-system-map-item-kind="file"]', (items) => items.every((item) => item.getAttribute('data-system-map-parent-frame') === 'context:directory:test')), true);
    await captureSystemMap(page, 'test');
    await page.focus('[aria-label="Collapse test"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-system-map-item-id="directory:test"]');
    if (process.env.BUNKERCODE_CAPTURE_VISUAL === '1') {
      await page.screenshot({ path: '/tmp/bunkercode-system-map-overview-1440.png', fullPage: true });
    }
    await page.focus('[data-surface="territory"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-spatial-territory-map]', { timeout: 5000 });
    assert.equal(await page.$eval('[data-surface="territory"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.ok(await page.$('[data-territory-region="directory:packages"]'));
    assert.ok(await page.$('[data-territory-preview-item="workspace-package:packages/analyzer-typescript"]'));
    assert.equal(await page.$eval('[data-spatial-territory-map]', (element) => element.getAttribute('data-territory-composition')), 'triad');
    assert.equal(await page.$eval('[data-territory-preview-item="workspace-package:packages/analyzer-typescript"]', (element) => element.getAttribute('data-territory-preview-kind')), 'territory');
    assert.equal(await page.$eval('[data-territory-preview-item="test/responsibility-contract.test.ts"]', (element) => element.getAttribute('data-territory-preview-kind')), 'file');
    assert.equal(await page.$eval('[data-spatial-territory-map]', (element) => Number((element as HTMLElement).dataset.analyzedFileCount)), snapshot.analysis.files.length);
    assert.equal(await page.$('[class="back-action"]'), null);
    assert.equal(await page.$('.relationship-key'), null);
    assert.equal(await page.$('.details-panel'), null);
    assert.equal(await page.$eval('.explorer-header-actions', (element) => !element.textContent?.includes('Fit graph') && !element.textContent?.includes('Center selected')), true);
    const rootState = await readExplorerUiState(page);
    await page.focus('[data-territory-select="directory:packages"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.territory-identity', { timeout: 5000 });
    assert.equal(await page.$eval('.territory-identity h2', (element) => element.textContent), 'packages');
    assert.equal(await page.$eval('[data-territory-select="directory:packages"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.deepEqual({ ...await readExplorerUiState(page), selected: null }, { ...rootState, selected: null });
    await clickButton(page, 'Close inspector');
    await page.waitForFunction(() => document.querySelector('.details-panel') === null, { timeout: 5000 });
    assert.equal(await page.$eval('[data-territory-select="directory:packages"]', (element) => element.getAttribute('aria-pressed')), 'false');
    await page.click('[data-territory-select="directory:packages"]');
    await clickButton(page, 'Open territory');
    await page.waitForSelector('[data-explorer-scale="territory"]', { timeout: 5000 });
    assert.ok(await page.$('[data-territory-region="workspace-package:packages/analyzer-typescript"]'));
    assert.equal(await page.$eval('[data-spatial-territory-map]', (element) => element.getAttribute('data-territory-composition')), 'triad');
    assert.equal(await page.$eval('.back-action', (element) => element.textContent?.includes('Back to system')), true);

    await page.click('[data-territory-select="workspace-package:packages/analyzer-typescript"]');
    await page.waitForSelector('.territory-identity', { timeout: 5000 });
    assert.equal(
      await page.$eval(
        '[data-disclosure="territory-technical-details"]',
        (element) =>
          element instanceof HTMLDetailsElement &&
          !element.open &&
          element.textContent?.includes('workspace-package'),
      ),
      true,
    );
    assert.equal(await page.$eval('[data-disclosure="territory-evidence"]', (element) => element instanceof HTMLDetailsElement && !element.open), true);
    await page.focus('[data-disclosure="territory-evidence"] summary');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-disclosure="territory-evidence"]', (element) => element.textContent?.includes('Workspace configuration: pnpm-workspace.yaml') && element.textContent.includes('Workspace pattern: packages/*') && element.textContent.includes('Package manifest: packages/analyzer-typescript/package.json')), true);
    await page.keyboard.press('Enter');
    await clickButton(page, 'Open territory');
    await page.waitForSelector('[data-territory-region="directory:packages/analyzer-typescript/src"]', { timeout: 5000 });
    await page.click('[data-territory-select="directory:packages/analyzer-typescript/src"]');
    await clickButton(page, 'Open territory');
    await page.waitForSelector('[data-file-landmark="packages/analyzer-typescript/src/analyze-project.ts"]', { timeout: 5000 });
    assert.equal(await page.$eval('[aria-label="Explorer location"]', (element) => element.textContent?.includes('analyzer-typescript') && element.textContent.includes('src')), true);

    await page.click('[aria-label="Find file"]');
    await page.keyboard.type('analyze-project.ts');
    await page.waitForSelector('[data-search-result="packages/analyzer-typescript/src/analyze-project.ts"]', { timeout: 5000 });
    await page.click('[data-search-result="packages/analyzer-typescript/src/analyze-project.ts"]');
    await page.waitForSelector('.file-identity', { timeout: 5000 });
    assert.equal(await page.$eval('.file-context h3', (element) => element.textContent), 'File in this territory');
    assert.equal(
      await page.$eval('.back-action', (element) => element.getAttribute('aria-label')?.startsWith('Back to ')),
      true,
    );
    assert.equal(await page.$eval('[data-file-landmark="packages/analyzer-typescript/src/analyze-project.ts"]', (element) => element.getAttribute('aria-pressed')), 'true');
    await clickButton(page, 'Show direct connections');
    await page.waitForSelector('[data-explorer-scale="file-connections"]', { timeout: 5000 });
    assert.ok(await page.$('.react-flow'));
    assert.equal(await page.$eval('.explorer-header-actions', (element) => element.textContent?.includes('Fit graph')), true);
    assert.ok(await page.$('[aria-label="Back to territory"]'));
    await page.focus('.back-action');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('back-action')), true);
    assert.ok(await page.$('.graph-node-target[data-id="packages/analyzer-typescript/src/analyze-project.ts"]'));
    assert.ok(await page.$('.graph-node-attention-anchor'));
    assert.ok(await page.$('.graph-node-attention-direct'));
    assert.equal(await page.$$eval('.react-flow__edge-path', (edges) => edges.every((edge) => edge.getAttribute('marker-end')?.includes('arrowclosed'))), true);
    assert.equal(await page.$$eval('.react-flow__edge', (edges) => edges.every((edge) => edge.getAttribute('aria-label')?.includes(' uses '))), true);
    assert.equal(await page.$eval('[data-disclosure="file-evidence"]', (element) => element instanceof HTMLDetailsElement && !element.open), true);
    await page.click('[data-disclosure="file-evidence"] summary');
    assert.equal(await page.$eval('[data-disclosure="file-evidence"]', (element) => element instanceof HTMLDetailsElement && element.open && element.textContent?.includes(' at ') && element.textContent.includes('(exact)')), true);
    await page.click('[aria-label="Back to territory"]');
    await page.waitForSelector('[data-explorer-scale="territory"]', { timeout: 5000 });
    assert.ok(await page.$('[data-file-landmark="packages/analyzer-typescript/src/analyze-project.ts"]'));
    assert.equal(await page.$('.react-flow'), null);
    assert.equal(
      await page.$eval('.back-action', (element) => element.getAttribute('aria-label')?.startsWith('Back to ')),
      true,
    );
    await page.click('[data-surface="overview"]');
    await page.waitForSelector('[data-system-map-status="ready"]', { timeout: 5000 });
    await page.setViewport({ width: 640, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, { timeout: 5000 });
    assert.equal(await page.$eval('[data-primary-explorer-surface]', (element) => element.getBoundingClientRect().top <= 340), true);
    if (process.env.BUNKERCODE_CAPTURE_VISUAL === '1') {
      await page.screenshot({ path: '/tmp/bunkercode-system-map-overview-640.png', fullPage: true });
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function previewServer(distDirectory: string) {
  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const filePath = path.resolve(distDirectory, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
    if (!filePath.startsWith(`${distDirectory}${path.sep}`)) return void response.writeHead(403).end();
    try {
      const contents = readFileSync(filePath);
      response.writeHead(200, {
        'Content-Type': filePath.endsWith('.js') ? 'text/javascript' : filePath.endsWith('.css') ? 'text/css' : 'text/html',
      }).end(contents);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
}

async function clickButton(page: import('puppeteer-core').Page, label: string): Promise<void> {
  await page.evaluate((buttonLabel) => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === buttonLabel);
    if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${buttonLabel}`);
    button.click();
  }, label);
}

async function readExplorerUiState(page: import('puppeteer-core').Page) {
  return page.evaluate(() => ({
    scale: document.querySelector('[data-explorer-scale]')?.getAttribute('data-explorer-scale'),
    selected: document.querySelector('.graph-node-selected')?.getAttribute('data-id'),
    viewport: (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform,
  }));
}

async function buildResponsibilityHarness(harnessRoot: string): Promise<string> {
  const entryPath = path.join(harnessRoot, 'entry.tsx');
  const distDirectory = path.join(harnessRoot, 'dist');
  const explorerModule = path.join(appRoot, 'src', 'explorer-app.tsx');
  const runtimeModule = path.join(appRoot, 'src', 'explorer-runtime.ts');
  const reactFlowStyles = path.join(appRoot, 'node_modules', '@xyflow', 'react', 'dist', 'style.css');
  const explorerStyles = path.join(appRoot, 'src', 'styles.css');
  const controlledSnapshot = responsibilityBrowserSnapshot();
  const fieldSnapshot = systemMapFieldBrowserSnapshot();

  writeFileSync(entryPath, `
    import { createRoot } from 'react-dom/client';
    import { Explorer } from ${JSON.stringify(explorerModule)};
    import { createExplorerRuntime } from ${JSON.stringify(runtimeModule)};
    import ${JSON.stringify(reactFlowStyles)};
    import ${JSON.stringify(explorerStyles)};

    const selectedSnapshot = new URLSearchParams(window.location.search).has('system-map-field-fixture')
      ? ${JSON.stringify(fieldSnapshot)}
      : ${JSON.stringify(controlledSnapshot)};
    const runtime = createExplorerRuntime(selectedSnapshot);
    if (runtime.kind !== 'ready') throw new Error('Controlled Explorer runtime is not ready.');
    const root = document.getElementById('root');
    if (!root) throw new Error('Harness root not found.');
    createRoot(root).render(<Explorer graph={runtime.graph} structure={runtime.structure} responsibilities={runtime.responsibilities} projectLabel={runtime.projectLabel} />);
  `);

  await build({
    absWorkingDir: repoRoot,
    entryPoints: [entryPath],
    outdir: distDirectory,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    nodePaths: [path.join(appRoot, 'node_modules')],
    logLevel: 'silent',
  });
  writeFileSync(path.join(distDirectory, 'index.html'), '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');
  return distDirectory;
}

function responsibilityBrowserSnapshot() {
  const methodSubject = {
    id: 'subject:src/users.controller.ts:UsersController.list',
    kind: 'method',
    fileId: 'src/users.controller.ts',
    symbolId: 'UsersController.list',
    name: 'UsersController.list',
    location: { filePath: 'src/users.controller.ts', line: 8, column: 3 },
  } as const;
  const persistenceSubject = {
    id: 'subject:src/prisma.service.ts:PrismaService',
    kind: 'class',
    fileId: 'src/prisma.service.ts',
    symbolId: 'PrismaService',
    name: 'PrismaService',
    location: { filePath: 'src/prisma.service.ts', line: 3, column: 1 },
  } as const;
  const provenance = { detector: { id: 'test.nestjs', version: '1' }, ruleId: 'route', ruleVersion: '1' };
  const evidence = (id: string, signal: string, location: typeof methodSubject.location) => [{
    id,
    kind: 'annotation',
    technology: { id: 'nestjs', displayName: 'NestJS' },
    signal,
    location,
  }];
  const notificationSubjects = [
    'NotificationsController.list',
    'NotificationsController.get',
    'NotificationsController.open',
    'NotificationsController.dismiss',
    'NotificationsController.clear',
  ].map((name, index) => ({
    id: `subject:src/z-notifications.controller.ts:${name}`,
    kind: 'method' as const,
    fileId: 'src/z-notifications.controller.ts',
    symbolId: name,
    name,
    location: { filePath: 'src/z-notifications.controller.ts', line: 10 + index, column: 3 },
  }));
  const createTaskSubject = {
    id: 'subject:src/z-tasks.controller.ts:TasksController.createTask',
    kind: 'method' as const,
    fileId: 'src/z-tasks.controller.ts',
    symbolId: 'TasksController.createTask',
    name: 'TasksController.createTask',
    location: { filePath: 'src/z-tasks.controller.ts', line: 20, column: 3 },
  };
  const archiveTaskSubject = {
    id: 'subject:src/z-tasks.controller.ts:TasksController.archiveTask',
    kind: 'method' as const,
    fileId: 'src/z-tasks.controller.ts',
    symbolId: 'TasksController.archiveTask',
    name: 'TasksController.archiveTask',
    location: { filePath: 'src/z-tasks.controller.ts', line: 21, column: 3 },
  };

  return {
    projectLabel: 'Responsibility fixture',
    analysis: {
      schemaVersion: 1,
      analyzer: { name: 'browser-fixture', language: 'typescript' },
      projectPath: '.',
      files: [
        { id: 'src/prisma.service.ts', path: 'src/prisma.service.ts' },
        { id: 'src/users.controller.ts', path: 'src/users.controller.ts' },
        { id: 'src/z-notifications.controller.ts', path: 'src/z-notifications.controller.ts' },
        { id: 'src/z-tasks.controller.ts', path: 'src/z-tasks.controller.ts' },
      ],
      dependencies: [],
      unresolvedDependencies: [],
      diagnostics: [],
    },
    responsibilities: {
      schemaVersion: 1,
      analyzer: { name: 'browser-fixture', language: 'typescript' },
      projectPath: '.',
      findings: [
        { id: 'finding:http', subject: methodSubject, responsibility: 'http-entry-point', confidence: 'exact', provenance, evidence: evidence('evidence:http', '@Get()', methodSubject.location) },
        ...notificationSubjects.map((subject, index) => ({ id: `finding:notification:${index}`, subject, responsibility: 'http-entry-point' as const, confidence: 'exact' as const, provenance, evidence: evidence(`evidence:notification:${index}`, '@Get()', subject.location) })),
        { id: 'finding:create-task', subject: createTaskSubject, responsibility: 'http-entry-point', confidence: 'exact', provenance, evidence: evidence('evidence:create-task', '@Post("tasks")', createTaskSubject.location) },
        { id: 'finding:archive-task', subject: archiveTaskSubject, responsibility: 'http-entry-point', confidence: 'exact', provenance, evidence: evidence('evidence:archive-task', '@Delete("tasks")', archiveTaskSubject.location) },
        { id: 'finding:access', subject: methodSubject, responsibility: 'access-control', confidence: 'inferred', provenance: { ...provenance, ruleId: 'guard' }, evidence: evidence('evidence:access', '@UseGuards()', methodSubject.location) },
        { id: 'finding:persistence', subject: persistenceSubject, responsibility: 'persistence-interaction', confidence: 'exact', provenance: { ...provenance, detector: { id: 'test.prisma', version: '1' }, ruleId: 'client' }, evidence: evidence('evidence:persistence', 'PrismaClient', persistenceSubject.location) },
      ],
      coverage: [
        { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'partially-evaluated', limitationIds: ['limitation:http'] },
        { capability: 'access-control', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] },
        { capability: 'persistence-interaction', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] },
        { capability: 'external-service-interaction', scope: { kind: 'project' }, status: 'not-evaluated' },
        { capability: 'queue-consumer', scope: { kind: 'project' }, status: 'unsupported' },
        { capability: 'scheduled-job', scope: { kind: 'project' }, status: 'failed', failure: { code: 'fixture-failure', message: 'Controlled failure.' }, limitationIds: [] },
      ],
      detectorExecutions: [],
      limitations: [{ id: 'limitation:http', scope: { kind: 'project' }, code: 'partial-fixture', message: 'Controlled partial coverage.' }],
    },
  };
}

function systemMapFieldBrowserSnapshot() {
  const snapshot = responsibilityBrowserSnapshot();
  const httpSource = snapshot.responsibilities.findings.find((finding) => finding.id === 'finding:http');
  const persistenceSource = snapshot.responsibilities.findings.find((finding) => finding.id === 'finding:persistence');
  if (!httpSource || !persistenceSource) throw new Error('Controlled Responsibility findings are unavailable.');
  const httpInAuth = {
    ...httpSource,
    id: 'finding:http:auth',
    subject: {
      ...httpSource.subject,
      id: 'subject:src/auth/auth.service.ts:AuthService',
      fileId: 'src/auth/auth.service.ts',
      symbolId: 'AuthService',
      name: 'AuthService',
      location: { filePath: 'src/auth/auth.service.ts', line: 4, column: 1 },
    },
    evidence: httpSource.evidence.map((item) => ({
      ...item,
      id: 'evidence:http:auth',
      signal: '@Controller("auth")',
      location: { filePath: 'src/auth/auth.service.ts', line: 4, column: 1 },
    })),
  };
  const persistenceInData = {
    ...persistenceSource,
    id: 'finding:persistence:data',
    subject: {
      ...persistenceSource.subject,
      id: 'subject:src/data/data.service.ts:DataService',
      fileId: 'src/data/data.service.ts',
      symbolId: 'DataService',
      name: 'DataService',
      location: { filePath: 'src/data/data.service.ts', line: 6, column: 1 },
    },
    evidence: persistenceSource.evidence.map((item) => ({
      ...item,
      id: 'evidence:persistence:data',
      signal: 'prisma.user.findMany()',
      location: { filePath: 'src/data/data.service.ts', line: 6, column: 1 },
    })),
  };
  return {
    ...snapshot,
    projectLabel: 'Territory Field fixture',
    analysis: {
      ...snapshot.analysis,
      files: [
        { id: 'src/auth/auth.service.ts', path: 'src/auth/auth.service.ts' },
        { id: 'src/data/data.service.ts', path: 'src/data/data.service.ts' },
        ...snapshot.analysis.files,
      ],
      dependencies: [
        { sourceFileId: 'src/auth/auth.service.ts', targetFileId: 'src/data/data.service.ts', moduleSpecifier: '../data/data.service', kind: 'internal', evidence: { location: { filePath: 'src/auth/auth.service.ts', line: 1, column: 1 } }, confidence: 'exact' },
        { sourceFileId: 'src/auth/auth.service.ts', moduleSpecifier: '@nestjs/common', kind: 'external', evidence: { location: { filePath: 'src/auth/auth.service.ts', line: 2, column: 1 } }, confidence: 'inferred' },
        { sourceFileId: 'src/users.controller.ts', targetFileId: 'src/auth/auth.service.ts', moduleSpecifier: './auth/auth.service', kind: 'internal', evidence: { location: { filePath: 'src/users.controller.ts', line: 1, column: 1 } }, confidence: 'exact' },
        { sourceFileId: 'src/data/data.service.ts', targetFileId: 'src/prisma.service.ts', moduleSpecifier: '../prisma.service', kind: 'internal', evidence: { location: { filePath: 'src/data/data.service.ts', line: 1, column: 1 } }, confidence: 'exact' },
      ],
      unresolvedDependencies: [
        { sourceFileId: 'src/auth/auth.service.ts', moduleSpecifier: './missing-auth', reason: 'relative-target-not-found', evidence: { location: { filePath: 'src/auth/auth.service.ts', line: 3, column: 1 } }, confidence: 'exact' },
      ],
    },
    responsibilities: {
      ...snapshot.responsibilities,
      findings: [...snapshot.responsibilities.findings, httpInAuth, persistenceInData],
    },
  };
}
