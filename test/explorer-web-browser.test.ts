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
    assert.equal((await page.$$('.react-flow__node')).length, 5);
    assert.equal((await page.$$('.graph-node-package')).length, 5);
    assert.equal((await page.$$('.graph-node-external')).length, 0);
    assert.ok(await page.$eval('.graph-canvas', (element) => element.textContent?.includes('Filesystem group: apps') ?? false));
    assert.equal(await page.$('[aria-label="Find file"]'), null);

    await page.waitForFunction(() => !document.body.textContent?.includes('Arranging visible graph...'), { timeout: 5000 });
    await clickFlowNode(page, 'workspace-package:packages/analyzer-typescript');
    await page.waitForFunction(() => document.body.textContent?.includes('Selected workspace package') ?? false, { timeout: 5000 });
    assert.ok(await page.$('[data-explorer-scale="system-map"]'));
    assert.ok(await page.$eval('.details-panel', (element) => (
      element.textContent?.includes('Detected workspace package')
      && element.textContent.includes('Workspace configuration: pnpm-workspace.yaml')
      && element.textContent.includes('Package manifest: packages/analyzer-typescript/package.json')
      && element.textContent.includes('file dependencies')
    )));
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
    assert.ok(await page.$eval('.details-panel', (element) => element.textContent?.includes('Dependencies') ?? false));
    await clickButton(page, 'Show direct connections');
    await page.waitForSelector('[data-explorer-scale="file-connections"]', { timeout: 5000 });
    await page.waitForSelector('[aria-label="Back to analyzer-typescript files"]', { timeout: 5000 });
    assert.equal(await page.$eval('[aria-label="Explorer location"] [aria-current="page"]', (element) => element.textContent), 'analyze-project.ts');
    assert.ok(await page.$('.react-flow__node[data-id="packages/analyzer-typescript/src/analyze-project.ts"].graph-node-target'));

    await clickFlowNode(page, 'packages/analyzer-typescript/src/analysis-result.ts');
    await clickButton(page, 'Show one more step');
    await page.waitForFunction(() => document.querySelectorAll('.graph-node-external').length > 0, { timeout: 5000 });
    await page.waitForFunction(() => !document.body.textContent?.includes('Arranging visible graph...'), { timeout: 5000 });
    assert.ok(await page.$('[data-explorer-scale="file-connections"]'));

    const externalNodeId = await page.$eval('.react-flow__node.graph-node-external', (element) => element.getAttribute('data-id'));
    assert.ok(externalNodeId);
    await clickFlowNode(page, externalNodeId);
    await page.waitForFunction(() => document.body.textContent?.includes('Selected external module') ?? false, { timeout: 5000 });
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
    assert.ok(await page.$eval('.details-panel', (element) => element.textContent?.includes('Selected workspace package') ?? false));

    await clickButton(page, 'Open files');
    await page.waitForSelector('[data-explorer-scale="part-files"]', { timeout: 5000 });
    await clickFlowNode(page, 'packages/analyzer-typescript/src/analyze-project.ts');
    await clickButton(page, 'Show direct connections');
    await page.waitForSelector('[aria-label="Back to analyzer-typescript files"]', { timeout: 5000 });

    await page.setViewport({ width: 640, height: 900 });
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
