import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';

const repoRoot = path.resolve('.');
const appRoot = path.join(repoRoot, 'apps', 'explorer-web');
const firefoxExecutablePath = process.env.BUNKERCODE_BROWSER_EXECUTABLE ?? '/usr/bin/firefox';

test('Explorer navigates the generated workspace Snapshot V1 in a real browser', { timeout: 90000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== '1') {
    t.skip('Set BUNKERCODE_BROWSER_TEST=1 to run the Firefox Explorer smoke test.');
    return;
  }

  if (!existsSync(firefoxExecutablePath)) {
    throw new Error(`Firefox executable not found: ${firefoxExecutablePath}`);
  }

  execFileSync('pnpm', ['--filter', '@bunker-code/explorer-web', 'build'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
  const distDirectory = path.join(appRoot, 'dist');
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const requestPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const filePath = path.resolve(distDirectory, requestPath);

    if (!filePath.startsWith(`${distDirectory}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const content = readFileSync(filePath);
      response.writeHead(200, { 'Content-Type': contentType(filePath) });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Explorer preview server did not expose a TCP address.');
  }

  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: firefoxExecutablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.graph-node-package', { timeout: 15000 });
    await page.waitForSelector('[data-explorer-scale="system-map"]', { timeout: 5000 });
    assert.ok((await page.screenshot()).byteLength > 1000);
    assert.equal(await page.$eval('h1', (element) => element.textContent), 'bunker-code');
    assert.equal(await page.$eval('[data-explorer-scale]', (element) => element.textContent?.includes('System map')), true);
    assert.equal(await page.$('[class="back-action"]'), null);
    assert.equal(await page.$eval('[aria-label="Explorer location"] [aria-current="page"]', (element) => element.textContent), 'bunker-code');
    assert.equal(await page.$eval('[data-system-part-count]', (element) => element.textContent), '5 detected parts');
    assert.equal(await page.$eval('[data-analyzed-file-count]', (element) => element.textContent), '24 analyzed files');
    assert.equal((await page.$$('.react-flow__node')).length, 5);
    assert.equal((await page.$$('.graph-node-package')).length, 5);
    assert.equal((await page.$$('.graph-node-external')).length, 0);
    assert.equal(await page.$$eval('.graph-node-package', (items) => items.every((item) => item.getAttribute('tabindex') === '0')), true);
    assert.deepEqual(await page.$$eval('.graph-node-package .part-node-name', (items) => items.map((item) => item.textContent)), [
      'cli',
      'explorer-web',
      'analyzer-typescript',
      'contracts',
      'graph-engine',
    ]);
    assert.equal(await page.$$eval('.graph-node-package .part-node-type', (items) => (
      items.length === 5 && items.every((item) => item.textContent === 'Part of this system')
    )), true);
    assert.equal((await page.$$('.graph-node-package .part-file-count')).length, 5);
    assert.equal((await page.$$('.graph-node-package .part-relationship-summary')).length, 5);
    assert.equal(await page.$eval('[data-filesystem-group="apps"]', (element) => element.textContent?.includes('cli · explorer-web')), true);
    assert.equal(await page.$eval('[data-filesystem-group="packages"]', (element) => (
      element.textContent?.includes('analyzer-typescript · contracts · graph-engine')
    )), true);
    assert.equal(await page.$eval('.relationship-key', (element) => (
      element.textContent?.includes('A → B')
      && element.textContent.includes('means A uses B')
      && element.textContent.includes('Arrow points to what is used.')
    )), true);
    assert.equal(await page.$eval('.graph-canvas', (element) => element.textContent?.includes('Filesystem group:')), false);
    assert.equal(await page.$('[aria-label="Find file"]'), null);

    await page.waitForFunction(() => !document.body.textContent?.includes('Arranging visible graph...'), { timeout: 5000 });
    assert.equal(await page.$$eval('.react-flow__edge-path', (edges) => (
      edges.length === 7 && edges.every((edge) => edge.getAttribute('marker-end')?.includes('arrowclosed'))
    )), true);
    assert.equal(await page.$$eval('.react-flow__edge', (edges) => edges.every((edge) => (
      edge.getAttribute('aria-label')?.includes(' uses ')
    ))), true);
    assert.ok(await page.$('.react-flow__edge[aria-label="analyzer-typescript uses contracts"]'));
    await clickFlowNode(page, 'workspace-package:packages/analyzer-typescript');
    await page.waitForFunction(() => document.body.textContent?.includes('Selected for inspection') ?? false, { timeout: 5000 });
    assert.ok(await page.$('[data-explorer-scale="system-map"]'));
    assert.deepEqual(await page.$$eval('.part-exploration > *', (items) => items.map((item) => (
      item instanceof HTMLDetailsElement ? item.dataset.disclosure : item.className
    ))), [
      'part-identity',
      'part-location',
      'part-relationships',
      'part-next-action',
      'technical-details',
      'evidence',
    ]);
    assert.equal(await page.$eval('.part-identity', (element) => (
      element.querySelector('.eyebrow')?.textContent === 'Part of this system'
      && element.querySelector('h2')?.textContent === 'analyzer-typescript'
      && element.querySelector('.part-file-summary')?.textContent === '4 analyzed files'
    )), true);
    assert.equal(await page.$eval('.part-location', (element) => (
      element.textContent?.includes('Located in')
      && element.textContent.includes('packages/analyzer-typescript')
    )), true);
    assert.equal(await page.$eval('[data-disclosure="technical-details"]', (element) => (
      element instanceof HTMLDetailsElement
      && !element.open
    )), true);
    assert.equal(await page.$eval('[data-disclosure="evidence"]', (element) => (
      element instanceof HTMLDetailsElement
      && !element.open
    )), true);
    assert.ok(await page.$('.graph-edge-uses'));
    assert.equal((await page.$$('.graph-edge-used-by')).length, 2);
    assert.equal(await page.$$eval('.react-flow__edge-text', (labels) => (
      labels.filter((label) => label.textContent === 'Uses').length === 1
      && labels.filter((label) => label.textContent === 'Used by').length === 2
    )), true);
    assert.ok(await page.$('.details-panel li[aria-label="analyzer-typescript uses contracts"]'));
    assert.ok(await page.$('.details-panel li[aria-label="cli uses analyzer-typescript"]'));
    assert.ok(await page.$('.details-panel li[aria-label="explorer-web uses analyzer-typescript"]'));

    const stateBeforeDisclosures = await page.evaluate(() => ({
      scale: document.querySelector('[data-explorer-scale]')?.getAttribute('data-explorer-scale'),
      selected: document.querySelector('.graph-node-selected')?.getAttribute('data-id'),
      edges: document.querySelectorAll('.react-flow__edge').length,
      viewportTransform: (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform,
    }));
    await page.focus('[data-disclosure="technical-details"] summary');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-disclosure="technical-details"]', (element) => (
      element instanceof HTMLDetailsElement
      && element.open
      && element.textContent?.includes('Workspace package')
      && element.textContent.includes('@bunker-code/analyzer-typescript')
      && element.textContent.includes('Root path')
      && element.textContent.includes('packages/analyzer-typescript')
      && element.textContent.includes('Filesystem group')
    )), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-disclosure="technical-details"]', (element) => (
      element instanceof HTMLDetailsElement && !element.open
    )), true);

    await page.focus('[data-disclosure="evidence"] summary');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-disclosure="evidence"]', (element) => (
      element instanceof HTMLDetailsElement
      && element.open
      && element.textContent?.includes('Workspace configuration: pnpm-workspace.yaml')
      && element.textContent.includes('Workspace pattern: packages/*')
      && element.textContent.includes('Package manifest: packages/analyzer-typescript/package.json')
      && element.textContent.includes('analyzer-typescript uses contracts')
      && element.textContent.includes('2 supporting file relationships')
      && element.textContent.includes('packages/analyzer-typescript/src/analysis-result.ts')
      && element.textContent.includes('(exact)')
    )), true);
    assert.deepEqual(await page.evaluate(() => ({
      scale: document.querySelector('[data-explorer-scale]')?.getAttribute('data-explorer-scale'),
      selected: document.querySelector('.graph-node-selected')?.getAttribute('data-id'),
      edges: document.querySelectorAll('.react-flow__edge').length,
      viewportTransform: (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform,
    })), stateBeforeDisclosures);
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-disclosure="evidence"]', (element) => (
      element instanceof HTMLDetailsElement && !element.open
    )), true);

    await clickButton(page, 'Open files');
    await page.waitForSelector('[data-explorer-scale="part-files"]', { timeout: 5000 });
    await page.waitForSelector('[aria-label="Back to system map"]', { timeout: 5000 });
    await page.waitForSelector('[aria-label="Explorer location"]', { timeout: 5000 });
    await page.waitForSelector('[aria-label="Find file"]', { timeout: 5000 });
    assert.deepEqual(await page.$$eval('[aria-label="Explorer location"] li', (items) => items.map((item) => item.textContent?.replace(/^\//, '').trim())), [
      'bunker-code',
      '@bunker-code/analyzer-typescript',
    ]);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Back to system map');
    assert.notEqual(await page.$eval('[aria-label="Back to system map"]', (element) => getComputedStyle(element).outlineStyle), 'none');
    assert.ok(await page.$('.react-flow__node[data-id="packages/contracts/src/index.ts"]'));
    assert.equal((await page.$$('.graph-node-package')).length, 0);

    await page.click('[aria-label="Find file"]');
    await page.keyboard.type('missing-file.ts');
    await page.waitForFunction(() => document.body.textContent?.includes('No internal files match this search.') ?? false, { timeout: 5000 });
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('analyze-project.ts');
    await page.waitForSelector('[data-search-result="packages/analyzer-typescript/src/analyze-project.ts"]', { timeout: 5000 });
    await page.click('[data-search-result="packages/analyzer-typescript/src/analyze-project.ts"]');
    await page.waitForFunction(() => document.body.textContent?.includes('Selected file') ?? false, { timeout: 5000 });
    assert.ok(await page.$('[data-explorer-scale="part-files"]'));
    assert.ok(await page.$eval('.details-panel', (element) => (
      element.textContent?.includes('Uses')
      && element.textContent.includes('Used by')
      && !element.textContent.includes('Dependencies')
      && !element.textContent.includes('Dependents')
    )));
    await clickButton(page, 'Show direct connections');
    await page.waitForSelector('[data-explorer-scale="file-connections"]', { timeout: 5000 });
    await page.waitForSelector('[aria-label="Back to analyzer-typescript files"]', { timeout: 5000 });
    assert.equal(await page.$eval('[aria-label="Explorer location"] [aria-current="page"]', (element) => element.textContent), 'analyze-project.ts');
    assert.ok(await page.$('.react-flow__node[data-id="packages/analyzer-typescript/src/analyze-project.ts"].graph-node-target'));
    assert.equal(await page.$$eval('.react-flow__edge-path', (edges) => (
      edges.length > 0 && edges.every((edge) => edge.getAttribute('marker-end')?.includes('arrowclosed'))
    )), true);
    assert.equal((await page.$$('.react-flow__edge-text')).length > 0, true);
    assert.ok(await page.$('.react-flow__edge[aria-label="analyze-project.ts uses ts-morph"]'));

    await clickFlowNode(page, 'packages/analyzer-typescript/src/analysis-result.ts');
    await clickButton(page, 'Show one more step');
    await page.waitForFunction(() => document.querySelectorAll('.graph-node-external').length > 0, { timeout: 5000 });
    await page.waitForFunction(() => !document.body.textContent?.includes('Arranging visible graph...'), { timeout: 5000 });
    assert.ok(await page.$('[data-explorer-scale="file-connections"]'));

    const externalNodeId = await page.$eval('.react-flow__node.graph-node-external', (element) => element.getAttribute('data-id'));
    assert.ok(externalNodeId);
    await clickFlowNode(page, externalNodeId);
    await page.waitForFunction(() => document.body.textContent?.includes('Selected external module') ?? false, { timeout: 5000 });
    assert.equal(await page.$eval('.details-panel', (element) => element.textContent?.includes('Used by') ?? false), true);
    assert.equal(await page.$eval('.details-panel', (element) => (
      [...element.querySelectorAll('button')].some((button) => (
        button.textContent === 'Show direct connections' || button.textContent === 'Show one more step'
      ))
    )), false);

    await page.click('[aria-label="Back to analyzer-typescript files"]');
    await page.waitForSelector('[data-explorer-scale="part-files"]', { timeout: 5000 });
    assert.ok(await page.$('.react-flow__node[data-id="packages/analyzer-typescript/src/analyze-project.ts"].graph-node-selected'));
    assert.ok(await page.$('[aria-label="Back to system map"]'));

    await clickFlowNode(page, 'packages/contracts/src/index.ts');
    assert.ok(await page.$('[data-explorer-scale="part-files"]'));
    assert.ok(await page.$eval('.details-panel', (element) => (
      element.textContent?.includes('Used by')
      && [...element.querySelectorAll('li[aria-label]')].some((item) => item.getAttribute('aria-label')?.endsWith('uses packages/contracts/src/index.ts'))
    )));
    assert.equal(await page.$eval('.details-panel', (element) => (
      [...element.querySelectorAll('button')].some((button) => button.textContent === 'Show direct connections')
    )), false);
    await page.evaluate(() => {
      document.querySelector('.react-flow__pane')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.details-panel')?.textContent?.includes('Part files') ?? false, { timeout: 5000 });
    assert.ok(await page.$('[data-explorer-scale="part-files"]'));

    await page.click('[aria-label="Back to system map"]');
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 5, { timeout: 5000 });
    await page.waitForSelector('[data-explorer-scale="system-map"]', { timeout: 5000 });
    assert.equal((await page.$$('.graph-node-package')).length, 5);
    assert.equal((await page.$$('.graph-node-external')).length, 0);
    assert.ok(await page.$('.react-flow__node[data-id="workspace-package:packages/analyzer-typescript"].graph-node-selected'));
    assert.ok(await page.$eval('.details-panel', (element) => element.textContent?.includes('Part of this system') ?? false));

    await page.setViewport({ width: 640, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, { timeout: 5000 });
    assert.equal(await page.$eval('.explorer-header', (element) => element.getBoundingClientRect().right <= window.innerWidth), true);
    assert.equal(await page.$eval('.system-map-summary', (element) => element.getBoundingClientRect().right <= window.innerWidth), true);
    assert.equal(await page.$eval('[data-system-part-count]', (element) => element.textContent), '5 detected parts');
    assert.equal(await page.$eval('[data-analyzed-file-count]', (element) => element.textContent), '24 analyzed files');
    assert.equal(await page.$eval('.relationship-key', (element) => {
      const rect = element.getBoundingClientRect();
      return element.textContent?.includes('A → B')
        && element.textContent.includes('means A uses B')
        && rect.width > 0
        && rect.right <= window.innerWidth;
    }), true);
    assert.equal(await page.$$eval('.react-flow__edge-path', (edges) => (
      edges.length === 7 && edges.every((edge) => edge.getAttribute('marker-end')?.includes('arrowclosed'))
    )), true);
    assert.equal((await page.$$('.graph-node-package .part-node-name')).length, 5);
    assert.equal(await page.$$eval('.graph-node-package', (items) => items.every((item) => (
      item.textContent?.includes('Part of this system')
      && item.textContent.includes('analyzed file')
      && (item.textContent.includes('Uses') || item.textContent.includes('No detected connections'))
    ))), true);
    assert.equal(await page.$eval('.details-panel', (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0
        && rect.right <= window.innerWidth
        && element.scrollWidth <= element.clientWidth
        && element.querySelector('.part-identity h2')?.textContent === 'analyzer-typescript'
        && element.querySelector('.part-file-summary')?.textContent === '4 analyzed files'
        && element.querySelector('.part-location')?.textContent?.includes('packages/analyzer-typescript')
        && element.querySelector('.part-relationships')?.textContent?.includes('Uses')
        && element.querySelector('.part-relationships')?.textContent?.includes('Used by')
        && [...element.querySelectorAll('button')].some((button) => button.textContent === 'Open files')
        && element.querySelectorAll('details:not([open])').length === 2;
    }), true);

    await clickButton(page, 'Open files');
    await page.waitForSelector('[data-explorer-scale="part-files"]', { timeout: 5000 });
    await clickFlowNode(page, 'packages/analyzer-typescript/src/analyze-project.ts');
    await clickButton(page, 'Show direct connections');
    await page.waitForSelector('[aria-label="Back to analyzer-typescript files"]', { timeout: 5000 });

    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, { timeout: 5000 });
    assert.equal(await page.$eval('[aria-label="Back to analyzer-typescript files"]', (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.right <= window.innerWidth;
    }), true);
    assert.ok(await page.$('[data-explorer-scale="file-connections"]'));
    assert.equal(await page.$eval('[aria-label="Explorer location"] [aria-current="page"]', (element) => element.textContent), 'analyze-project.ts');
    assert.ok((await page.screenshot()).byteLength > 1000);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function clickButton(page: import('puppeteer-core').Page, label: string): Promise<void> {
  await page.evaluate((buttonLabel) => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === buttonLabel);

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${buttonLabel}`);
    }

    button.click();
  }, label);
}

async function clickFlowNode(page: import('puppeteer-core').Page, nodeId: string): Promise<void> {
  await page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);

    if (!(node instanceof HTMLElement)) {
      throw new Error(`Graph node not found: ${id}`);
    }

    node.click();
  }, nodeId);
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html';
}
