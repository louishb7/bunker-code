import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer, { type Page } from 'puppeteer-core';
import type { PlannedSystemModel } from '../packages/contracts/src/index.js';
import type { DesignerDocument } from '../apps/explorer-web/src/design/designer-storage.js';

async function click(page: Page, label: string, scope = '') {
  if (label === 'Add Claim' || label === 'Add Question') {
    const notes = await page.$('.designer-inspector-tabs button:nth-child(2)');
    if (notes) await notes.click();
  }
  const handle = await page.evaluateHandle((label, scope) => [...document.querySelectorAll(`${scope} button`)].find((button) => button.textContent?.trim() === label), label, scope);
  const element = handle.asElement();
  assert.ok(element, `Button ${label} exists in ${scope || 'workspace'}`);
  await element.click(); await handle.dispose();
}
async function saved(page: Page): Promise<DesignerDocument> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('bunkercode.design.v1:'));
    if (!key) throw new Error('No saved DESIGN document');
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  });
}
async function fill(page: Page, selector: string, value: string) {
  await page.$eval(selector, (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('DESIGN authors a system without a snapshot, persists layout and intent, and validates import/export in a browser', { timeout: 180000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== '1') { t.skip('Set BUNKERCODE_BROWSER_TEST=1 to run DESIGN browser smoke.'); return; }
  const app = path.resolve('apps/explorer-web');
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-design-browser-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const entry = path.join(temporary, 'entry.tsx');
  writeFileSync(entry, `
    import { createRoot } from 'react-dom/client';
    import { WorkspaceApp } from ${JSON.stringify(path.join(app, 'src/workspace-app.tsx'))};
    import ${JSON.stringify(path.join(app, 'node_modules/@xyflow/react/dist/style.css'))};
    import ${JSON.stringify(path.join(app, 'src/styles.css'))};
    import ${JSON.stringify(path.join(app, 'src/design/design.css'))};
    const loadSnapshot = async () => { throw new Error('No analyzed project'); };
    createRoot(document.getElementById('root')!).render(<WorkspaceApp loadSnapshot={loadSnapshot} />);
  `);
  const dist = path.join(temporary, 'dist');
  await build({ entryPoints: [entry], outdir: dist, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', nodePaths: [path.join(app, 'node_modules')], logLevel: 'silent' });
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>');
  const server = createServer((request, response) => {
    const name = request.url === '/entry.js' ? 'entry.js' : request.url === '/entry.css' ? 'entry.css' : 'index.html';
    response.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
    response.end(readFileSync(path.join(dist, name)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>((resolve) => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: process.env.BUNKERCODE_BROWSER_EXECUTABLE ?? '/usr/bin/firefox', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 960 });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(String(error)));
  let acceptDialogs = true;
  page.on('dialog', (dialog) => { void (acceptDialogs ? dialog.accept() : dialog.dismiss()); });
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-design-library]');
  await page.click('a[href="#observe"]');
  await page.waitForFunction(() => document.body.textContent?.includes('No analyzed project'));
  await page.click('a[href="#design"]');
  await click(page, 'Create System'); await page.type('input[name="name"]', 'Future Project'); await click(page, 'Create System');
  await page.waitForSelector('[data-designer]');
  for (const label of ['Web Client', 'API', 'Authentication', 'Users', 'Database', 'Notification Worker']) {
    await click(page, '+ Add Part'); await page.type('input[name="label"]', label); await click(page, 'Add Part', '.designer-inspector');
    await page.waitForFunction((label) => document.querySelector('.designer-inspector h2')?.textContent === label, {}, label);
  }
  let model = (await saved(page)).model;
  const partId = (label: string) => { const part = model.parts.find((part) => part.label === label); assert.ok(part); return part.id; };
  for (const [source, predicate, target] of [['Web Client', 'uses', 'API'], ['API', 'depends on', 'Authentication'], ['Authentication', 'accesses', 'Database'], ['Users', 'accesses', 'Database'], ['API', 'uses', 'Notification Worker']]) {
    assert.ok(source && predicate && target);
    await click(page, '+ Add Relation');
    await page.select('select[name="source"]', partId(source)); await page.select('select[name="target"]', partId(target));
    const option = await page.$$eval('select[name="predicate"] option', (options, predicate) => options.find((option) => option.textContent === predicate)?.getAttribute('value'), predicate);
    assert.ok(option); await page.select('select[name="predicate"]', option); await click(page, 'Add Relation');
    await page.waitForSelector('[data-inspector-subject="relation"]');
  }
  assert.equal((await saved(page)).model.relations.length, 5);
  assert.equal((await saved(page)).model.predicates.length, 3);
  await click(page, 'System context'); await click(page, 'Add Claim');
  await page.type('textarea[name="statement"]', 'Protected operations require authentication.'); await click(page, 'Save Claim');
  await click(page, 'Add Question'); await page.type('textarea[name="question"]', 'How should notifications work?'); await click(page, 'Save Question');
  await click(page, 'Auto arrange');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Auto arrange' && !button.disabled));
  await page.waitForFunction(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('bunkercode.design.v1:'));
    return key && Object.keys(JSON.parse(localStorage.getItem(key) ?? '{}').presentation.positions).length === 6;
  });
  const arranged = (await saved(page)).presentation.positions;
  await click(page, 'Undo');
  assert.notDeepEqual((await saved(page)).presentation.positions, arranged, 'Arrangement can be undone');
  await click(page, 'Redo');
  assert.deepEqual((await saved(page)).presentation.positions, arranged);
  await click(page, 'Fit system');
  await page.waitForSelector('.designer-edge-label');
  assert.equal(await page.$$eval('.react-flow__edge', (edges) => edges.length), 5);
  await page.click('.designer-edge-label'); await page.waitForSelector('[data-inspector-subject="relation"]');
  await fill(page, '.designer-inspector textarea[name="description"]', 'An authored connection.'); await click(page, 'Save Relation');
  await click(page, 'Add Question'); await page.type('textarea[name="question"]', 'Is this boundary synchronous?'); await click(page, 'Save Question');
  const api = await page.$(`.react-flow__node[data-id="${partId('API')}"]`); assert.ok(api);
  await api.click(); await page.waitForSelector('[data-inspector-subject="part"]');
  await fill(page, 'input[name="label"]', 'Public API');
  acceptDialogs = false;
  await click(page, 'System context');
  assert.equal(await page.$eval('input[name="label"]', (element) => (element as HTMLInputElement).value), 'Public API', 'Cancelled navigation preserves the draft');
  await page.screenshot({ path: '/tmp/bunkercode-design-after-part-draft.png', fullPage: true });
  assert.match(await page.$eval('[role="status"]', (element) => element.textContent ?? ''), /Unsaved form/);
  await page.click('a[href="#observe"]');
  await page.waitForFunction(() => location.hash === '#design');
  assert.equal(await page.$eval('input[name="label"]', (element) => (element as HTMLInputElement).value), 'Public API', 'Area navigation preserves a rejected draft discard');
  acceptDialogs = true;
  await page.click('.designer-inspector-tabs button:nth-child(2)');
  assert.ok(await page.$('.designer-annotations'), 'Discarding a draft must reach the requested inspector section');
  await click(page, 'Details');
  assert.equal(await page.$eval('input[name="label"]', (element) => (element as HTMLInputElement).value), 'API');
  await fill(page, 'input[name="label"]', 'Public API');
  await page.evaluate(`(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('bunkercode.design.v1:')) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      original.call(this, key, value);
    };
    Object.defineProperty(window, '__restoreDesignerStorage', { configurable: true, value: () => { Storage.prototype.setItem = original; } });
  })()`);
  await click(page, 'Save changes');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('Not saved'));
  assert.equal((await saved(page)).model.parts.find((part) => part.id === partId('API'))?.label, 'API');
  await page.evaluate(() => { const restore: unknown = Reflect.get(window, '__restoreDesignerStorage'); if (typeof restore === 'function') restore(); });
  await page.focus('input[name="label"]'); await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
  await page.waitForFunction(() => document.querySelector('.designer-inspector h2')?.textContent === 'Public API');
  assert.equal(await page.$('[role="alert"]'), null);
  const box = await api.boundingBox(); assert.ok(box);
  const beforeDrag = (await saved(page)).presentation.positions[partId('API')];
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 60, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction((id, before) => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('bunkercode.design.v1:'));
    return key && JSON.stringify(JSON.parse(localStorage.getItem(key) ?? '{}').presentation.positions[id]) !== JSON.stringify(before);
  }, {}, partId('API'), beforeDrag);
  await click(page, 'System context');
  await page.screenshot({ path: '/tmp/bunkercode-design-after-canvas.png', fullPage: true });
  await click(page, 'Add Claim'); await page.type('textarea[name="statement"]', 'This draft should be cancelled.'); await page.keyboard.press('Escape');
  assert.equal(await page.$('textarea[name="statement"]'), null);
  const beforeReload = await saved(page);
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('[data-design-library]');
  await click(page, 'Open'); await page.waitForSelector('[data-designer]');
  const reopened = await saved(page);
  assert.deepEqual(reopened.model, beforeReload.model);
  assert.deepEqual(reopened.presentation.positions, beforeReload.presentation.positions);
  assert.equal(reopened.model.claims[0]?.modality, 'required'); assert.equal(reopened.model.openQuestions.length, 2);
  await click(page, 'Add Question'); await page.type('textarea[name="question"]', 'What is the first milestone?'); await click(page, 'Save Question');
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob) void blob.text().then((raw) => { document.documentElement.dataset.exportedModel = raw; });
      return original(blob);
    };
  });
  await click(page, 'Export JSON'); await page.waitForFunction(() => !!document.documentElement.dataset.exportedModel);
  const exported = await page.$eval('html', (element) => (element as HTMLElement).dataset.exportedModel ?? '');
  assert.deepEqual(JSON.parse(exported), (await saved(page)).model);
  await click(page, '← Systems'); await page.screenshot({ path: '/tmp/bunkercode-design-after-library.png', fullPage: true }); await click(page, 'Import JSON');
  await fill(page, '[aria-label="Planned System JSON"]', '{'); await click(page, 'Import system');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('not valid JSON'));
  await fill(page, '[aria-label="Planned System JSON"]', exported); await click(page, 'Import system');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('already has this identity'));
  await click(page, 'Import as new system'); await page.waitForSelector('[data-designer]');
  const importedModels = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('bunkercode.design.v1:')).map((key) => JSON.parse(localStorage.getItem(key) ?? '{}').model as PlannedSystemModel));
  assert.equal(importedModels.length, 2);
  assert.notEqual(importedModels[0]?.id, importedModels[1]?.id);
  assert.deepEqual(importedModels[0]?.parts, importedModels[1]?.parts);
  await click(page, '+ Add Relation');
  await page.select('select[name="source"]', partId('Users'));
  await page.select('select[name="target"]', partId('API'));
  await page.select('select[name="predicate"]', 'custom');
  await page.type('.designer-form input:not([name])', 'notifies');
  await page.type('.designer-form textarea:not([name])', 'The source delivers a notification to the target.');
  await click(page, 'Add Relation'); await page.waitForSelector('[data-inspector-subject="relation"]');
  await page.waitForFunction(() => document.querySelector('.designer-relation-sentence')?.textContent?.includes('notifies'));
  await page.select('select[name="predicate"]', 'custom');
  await page.type('.designer-form input:not([name])', 'delivers to');
  await page.type('.designer-form textarea:not([name])', 'The source delivers an event to the target.');
  await click(page, 'Save Relation');
  await fill(page, '.designer-inspector textarea[name="description"]', 'Delivery with retries.');
  await click(page, 'Save Relation');
  assert.equal(await page.$$eval('select[name="predicate"] option', (options) => options.filter((option) => option.textContent === 'delivers to').length), 1);
  await click(page, 'Add Claim'); await page.type('textarea[name="statement"]', 'Delivery must be retried.'); await click(page, 'Save Claim');
  await click(page, 'System context');
  await page.type('[aria-label="Find Part"]', 'Users');
  await click(page, 'Users', '.designer-search-results');
  await page.waitForSelector('[data-inspector-subject="part"]');
  const beforeCascade = await page.evaluate((originalId) => Object.keys(localStorage).filter((key) => key.startsWith('bunkercode.design.v1:')).map((key) => JSON.parse(localStorage.getItem(key) ?? '{}') as DesignerDocument).find((entry) => entry.model.id !== originalId), beforeReload.model.id);
  assert.ok(beforeCascade);
  await click(page, 'Delete Part'); await page.waitForSelector('[data-inspector-subject="model"]');
  const afterRemoval = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('bunkercode.design.v1:')).map((key) => JSON.parse(localStorage.getItem(key) ?? '{}').model as PlannedSystemModel));
  const original = afterRemoval.find((item) => item.id === beforeReload.model.id);
  const copy = afterRemoval.find((item) => item.id !== beforeReload.model.id);
  assert.equal(original?.parts.length, 6);
  assert.equal(copy?.parts.length, 5);
  assert.equal(copy?.relations.length, 4);
  assert.equal(copy?.claims.length, 1);
  assert.ok(copy?.predicates.some((predicate) => predicate.label === 'notifies'));
  await click(page, 'Undo');
  const restored = await page.evaluate((id) => JSON.parse(localStorage.getItem('bunkercode.design.v1:' + id) ?? '{}') as DesignerDocument, beforeCascade.model.id);
  assert.deepEqual(restored.model, beforeCascade.model, 'Undo restores the entire cascade including notes');
  assert.deepEqual(restored.presentation.positions, beforeCascade.presentation.positions);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem('bunkercode.design.v1:' + id) ?? '{}').model.parts.length === 5, {}, beforeCascade.model.id);
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem('bunkercode.design.v1:' + id) ?? '{}').model.parts.length === 6, {}, beforeCascade.model.id);
  await click(page, 'Fit system');
  assert.equal(await page.$$eval('button', (buttons) => buttons.find((button) => button.textContent === 'Redo')?.disabled), false, 'Camera changes preserve redo');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press('n'); await page.waitForSelector('input[name="label"]');
  await page.type('input[name="label"]', 'Temporary Part');
  assert.match(await page.$eval('[role="status"]', (element) => element.textContent ?? ''), /Unsaved form/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.designer-inspector h2')?.textContent === 'Temporary Part');
  assert.equal(await page.$$eval('button', (buttons) => buttons.find((button) => button.textContent === 'Redo')?.disabled), true, 'A new edit after undo starts a new branch');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press('Delete');
  await page.waitForSelector('[data-inspector-subject="model"]');
  await click(page, 'Undo');
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem('bunkercode.design.v1:' + id) ?? '{}').model.parts.some((part: { label: string }) => part.label === 'Temporary Part'), {}, beforeCascade.model.id);
  await click(page, 'Auto arrange');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Auto arrange' && !button.disabled));
  await page.screenshot({ path: '/tmp/bunkercode-design-after-history.png', fullPage: true });
  await page.setViewport({ width: 600, height: 850 });
  await click(page, 'Fit system');
  await page.screenshot({ path: '/tmp/bunkercode-design-after-small.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
});
