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

test('Explorer starts in Overview and presents a factual Responsibility flow in a real browser', { timeout: 90000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== '1') {
    t.skip('Set BUNKERCODE_BROWSER_TEST=1 to run the Firefox Explorer smoke test.');
    return;
  }
  if (!existsSync(firefoxExecutablePath)) throw new Error(`Firefox executable not found: ${firefoxExecutablePath}`);

  const harnessRoot = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-responsibility-browser-'));
  t.after(() => rmSync(harnessRoot, { recursive: true, force: true }));
  const distDirectory = await buildResponsibilityHarness(harnessRoot);
  const server = previewServer(distDirectory);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Responsibility harness did not expose a TCP address.');
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: firefoxExecutablePath, headless: true });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-system-overview]', { timeout: 15000 });

    assert.equal(await page.$eval('[data-surface="overview"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[data-surface="responsibility"]', (element) => (element as HTMLButtonElement).disabled), false);
    assert.ok(await page.$('[data-observable-part="directory:src"]'));
    assert.ok(await page.$('[data-known-responsibility="finding:http"]'));
    assert.equal(await page.$('.react-flow'), null);
    assert.equal(await page.$eval('[data-primary-explorer-surface]', (element) => element.getBoundingClientRect().top <= 220), true);
    assert.equal(await page.$eval('[data-responsibility-coverage="partially-evaluated"]', (element) => element.textContent?.includes('partially-evaluated')), true);
    assert.equal(await page.$('[data-comprehension-section="uncertainty"] [data-responsibility-coverage="evaluated"]'), null);
    assert.ok(await page.$('[data-architectural-meaning-undetermined="directory:src"]'));

    await page.focus('[data-surface="responsibility"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-responsibility-map]', { timeout: 5000 });
    assert.equal(await page.$eval('[data-surface="responsibility"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[data-responsibility-spatial-field]', (element) => element.getAttribute('data-responsibility-composition')), 'constellation');
    assert.equal(await page.$eval('[data-responsibility-family="interface"]', (element) => element.textContent?.includes('Interface')), true);
    assert.ok(await page.$('[data-responsibility="http-entry-point"]'));
    assert.equal(await page.$('.responsibility-map .react-flow'), null);
    assert.equal(await page.$('.details-panel'), null);
    assert.equal(await page.$eval('.explorer-header-actions', (element) => !element.textContent?.includes('Fit graph') && !element.textContent?.includes('Center selected')), true);
    assert.equal(await page.$eval('[data-responsibility-coverage-notice]', (element) => element.textContent?.includes('coverage is incomplete')), true);

    await page.focus('[data-responsibility="http-entry-point"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-responsibility-subject="finding:http"]', { timeout: 5000 });
    assert.ok(await page.$('[data-responsibility-subject-preview]'));
    assert.ok(await page.$('[data-responsibility-subject-preview-item="finding:http"]'));
    assert.ok(await page.$('.details-panel'));
    assert.equal(await page.$eval('[data-responsibility-details]', (element) => element.textContent?.includes('UsersController.list') && element.textContent.includes('1 subject')), true);
    if (process.env.BUNKERCODE_CAPTURE_VISUAL === '1') {
      await page.screenshot({ path: '/tmp/bunkercode-responsibility-1440.png', fullPage: true });
    }
    await page.click('[data-responsibility-subject="finding:http"]');
    assert.equal(await page.$eval('[data-selected-responsibility-subject]', (element) => element.textContent?.includes('src/users.controller.ts:8:3')), true);
    assert.equal(await page.$eval('[data-disclosure="responsibility-evidence"]', (element) => element instanceof HTMLDetailsElement && !element.open), true);
    await page.click('[data-disclosure="responsibility-evidence"] summary');
    assert.equal(await page.$eval('[data-disclosure="responsibility-evidence"]', (element) => {
      const text = element.textContent ?? '';
      return text.includes('test.nestjs') && text.includes('route') && text.includes('@Get()') && text.includes('exact');
    }), true);
    await page.click('[data-disclosure="responsibility-coverage"] summary');
    assert.equal(await page.$eval('[data-disclosure="responsibility-coverage"]', (element) => {
      const text = element.textContent ?? '';
      return text.includes('Evaluated') && text.includes('Partially evaluated') && text.includes('Not evaluated') && text.includes('Unsupported') && text.includes('Failed');
    }), true);
    assert.equal(await page.$eval('[data-disclosure="responsibility-coverage"] li', (element) => element.getClientRects().length > 0), true);

    await clickButton(page, 'Locate in Territory');
    await page.waitForSelector('[data-surface="territory"][aria-pressed="true"]', { timeout: 5000 });
    await page.waitForSelector('[data-explorer-scale="territory"]', { timeout: 5000 });
    assert.equal(await page.$('.react-flow'), null);
    assert.equal(await page.$eval('[data-file-landmark="src/users.controller.ts"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[aria-label="Explorer location"]', (element) => element.textContent?.includes('src')), true);

    const territoryLocation = await page.$eval('[aria-label="Explorer location"]', (element) => element.textContent);
    await page.focus('[data-surface="responsibility"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-responsibility-map]', { timeout: 5000 });
    assert.equal(await page.$eval('[aria-label="Explorer location"]', (element) => element.textContent), territoryLocation);
    await page.click('[data-surface="territory"]');
    await page.waitForSelector('[data-file-landmark="src/users.controller.ts"][aria-pressed="true"]', { timeout: 5000 });

    await page.click('[data-surface="responsibility"]');
    await page.click('[data-responsibility="access-control"]');
    assert.ok(await page.$('[data-responsibility-subject="finding:access"]'));
    assert.equal(await page.$eval('[data-responsibility-subject="finding:access"]', (element) => element.textContent?.includes('UsersController.list')), true);

    await clickButton(page, 'Close inspector');
    await page.waitForFunction(() => document.querySelector('.details-panel') === null, { timeout: 5000 });
    assert.equal(await page.$('[data-responsibility-subject-preview]'), null);

    await page.click('[data-surface="overview"]');
    await page.waitForSelector('[data-system-overview]', { timeout: 5000 });
    assert.equal(await page.$eval('[aria-label="Explorer location"]', (element) => element.textContent), territoryLocation);
    await page.setViewport({ width: 640, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, { timeout: 5000 });
    assert.equal(await page.$eval('[data-primary-explorer-surface]', (element) => element.getBoundingClientRect().top <= 340), true);
    if (process.env.BUNKERCODE_CAPTURE_VISUAL === '1') {
      await page.screenshot({ path: '/tmp/bunkercode-responsibility-640.png', fullPage: true });
    }
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
    await page.waitForSelector('[data-system-overview]', { timeout: 15000 });
    assert.equal(await page.$eval('[data-surface="overview"]', (element) => element.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('[data-surface="responsibility"]', (element) => (element as HTMLButtonElement).disabled), true);
    assert.equal(await page.$eval('[data-surface="territory"]', (element) => (element as HTMLButtonElement).disabled), false);
    assert.equal(await page.$eval('[data-overview-responsibility-unavailable]', (element) => {
      const text = element.textContent ?? '';
      return text.includes('No factual Responsibility finding is available') && text.includes('does not establish that the system has no architectural responsibilities');
    }), true);
    assert.ok(await page.$('[data-comprehension-section="observable-parts"]'));
    assert.ok(await page.$('[data-comprehension-section="known-responsibilities"]'));
    assert.ok(await page.$('[data-comprehension-section="factual-relations"]'));
    assert.ok(await page.$('[data-comprehension-section="uncertainty"]'));
    assert.equal(await page.$$('[data-system-connection]').then((connections) => connections.length > 0), true);
    assert.ok(await page.$('[data-factual-relation="external-module-touchpoint"]'));
    assert.ok(await page.$('[data-architectural-meaning-undetermined]'));
    assert.equal(await page.$('.react-flow'), null);
    assert.equal(await page.$eval('[data-primary-explorer-surface]', (element) => element.getBoundingClientRect().top <= 220), true);
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
    await page.waitForSelector('[data-system-overview]', { timeout: 5000 });
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

  writeFileSync(entryPath, `
    import { createRoot } from 'react-dom/client';
    import { Explorer } from ${JSON.stringify(explorerModule)};
    import { createExplorerRuntime } from ${JSON.stringify(runtimeModule)};
    import ${JSON.stringify(reactFlowStyles)};
    import ${JSON.stringify(explorerStyles)};

    const runtime = createExplorerRuntime(${JSON.stringify(controlledSnapshot)});
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

  return {
    projectLabel: 'Responsibility fixture',
    analysis: {
      schemaVersion: 1,
      analyzer: { name: 'browser-fixture', language: 'typescript' },
      projectPath: '.',
      files: [
        { id: 'src/prisma.service.ts', path: 'src/prisma.service.ts' },
        { id: 'src/users.controller.ts', path: 'src/users.controller.ts' },
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
