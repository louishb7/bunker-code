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

test('Explorer focuses and expands a generated Snapshot V1 in a real browser', { timeout: 90000 }, async (t) => {
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
    await page.waitForSelector('.react-flow__node', { timeout: 15000 });
    assert.ok((await page.screenshot()).byteLength > 1000);
    assert.equal((await page.$$('.react-flow__node')).length, 4);
    assert.equal((await page.$$('.graph-node-external')).length, 0);

    await page.click('[aria-label="Find file"]');
    await page.keyboard.type('missing-file.ts');
    await page.waitForFunction(() => document.body.textContent?.includes('No internal files match this search.') ?? false, { timeout: 5000 });
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('analysis-result.ts');
    await page.waitForSelector('[data-search-result="src/analysis-result.ts"]', { timeout: 5000 });
    await page.click('[data-search-result="src/analysis-result.ts"]');
    await page.waitForFunction(() => document.body.textContent?.includes('Selected file') ?? false, { timeout: 5000 });
    await clickButton(page, 'Center selected');
    await clickButton(page, 'Fit graph');
    await clickButton(page, 'Focus file');
    await page.waitForFunction(() => document.body.textContent?.includes('Overview') ?? false, { timeout: 5000 });
    assert.equal((await page.$$('.react-flow__node')).length, 4);
    assert.equal((await page.$$('.graph-node-target')).length, 1);
    assert.equal((await page.$$('.graph-node-external')).length, 1);

    await page.click('.react-flow__node[data-id="src/analyze-project.ts"]');
    await page.waitForFunction(() => document.body.textContent?.includes('src/analyze-project.ts') ?? false, { timeout: 5000 });
    assert.ok(await page.$eval('.details-panel', (element) => element.textContent?.includes('Dependencies') ?? false));
    await clickButton(page, 'Expand context');
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 7, { timeout: 5000 });
    assert.equal((await page.$$('.graph-node-external')).length, 4);

    await clickButton(page, 'Overview');
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 4, { timeout: 5000 });
    assert.equal((await page.$$('.graph-node-external')).length, 0);
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

function contentType(filePath: string): string {
  if (filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html';
}
