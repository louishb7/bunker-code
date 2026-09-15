import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:5181';
const output = path.resolve('spatial-prototypes/captures');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: '/usr/bin/firefox', headless: true });
const results: object[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  for (const candidate of ['atlas', 'hyperbolic', 'icicle']) {
    for (const project of ['bc', 'cadisk', 'bm']) {
      await page.goto(`${base}/?candidate=${candidate}&project=${project}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('html[data-ready="true"]');
      async function capture(state: string) {
        await page.screenshot({ path: path.join(output, `${candidate}-${project}-${state}.png`) });
        results.push(await page.evaluate(({ candidate, project, state }) => {
          const stage = document.querySelector<HTMLElement>('.stage');
          return { candidate, project, state, ...stage?.dataset,
            labels: [...document.querySelectorAll<HTMLElement>('[data-id]')].map(el => ({ id: el.dataset.id, text: el.textContent, visible: el.dataset.labelVisible })) };
        }, { candidate, project, state }));
      }
      async function enter(id: string, keyboard = false) {
        const selector = `[data-id="${id}"]`;
        await page.waitForSelector(selector);
        if (keyboard) { await page.$eval(selector, el => { if (el instanceof HTMLElement || el instanceof SVGElement) el.focus(); }); await page.keyboard.press('Enter'); }
        else await page.click(selector);
        await page.waitForFunction(id => document.querySelector<HTMLElement>('.stage')?.dataset.focus === id, {}, id);
      }
      await capture('macro');
      if (project === 'bc') {
        await enter('directory:packages', true);
        await enter('directory:packages/graph-engine', true);
        await capture('graph-engine');
        await page.keyboard.press('Backspace');
        assert.equal(await page.$eval('.stage', e => (e as HTMLElement).dataset.focus), 'directory:packages');
        await page.click('[data-action="system"]');
        await enter('directory:apps');
        await enter('directory:apps/explorer-web');
        await enter('directory:apps/explorer-web/src');
        await capture('explorer-src');
      } else {
        if (candidate === 'atlas' || project === 'bm') await enter('directory:src');
        await enter('directory:src/auth', true);
        await capture('auth');
        await enter('src/auth/auth.service.ts', true);
        await page.keyboard.press(' ');
        assert.ok(await page.$('.relations h3'));
        await capture('file-relations');
        await page.keyboard.press('Backspace');
        assert.equal(await page.$eval('.stage', e => (e as HTMLElement).dataset.focus), 'directory:src/auth');
        if (project === 'cadisk') {
          await page.keyboard.press('Backspace');
          await enter('directory:src/case'); await capture('case');
          await page.keyboard.press('Backspace');
          await enter('directory:src/user'); await capture('distant-sibling');
        }
      }
      const ownerCount = await page.$eval('.stage', e => Number((e as HTMLElement).dataset.ownerCount));
      assert.equal(ownerCount, project === 'bc' ? 66 : project === 'cadisk' ? 74 : 36);
      await page.focus('.stage'); await page.keyboard.press('Home');
      const beforeCamera = await page.$eval('.stage', e => (e as HTMLElement).dataset.camera);
      await page.keyboard.press('+');
      assert.notEqual(await page.$eval('.stage', e => (e as HTMLElement).dataset.camera), beforeCamera);
      const afterKey = await page.$eval('.stage', e => (e as HTMLElement).dataset.camera);
      await page.mouse.move(550, 450); await page.mouse.wheel({ deltaY: -240 });
      await page.waitForFunction(previous => document.querySelector<HTMLElement>('.stage')?.dataset.camera !== previous, {}, afterKey);
      const beforeDrag = await page.$eval('.stage', e => (e as HTMLElement).dataset.camera);
      await page.mouse.move(550, 450); await page.mouse.down();
      await page.mouse.move(610, 470, { steps: 4 }); await page.mouse.up();
      assert.notEqual(await page.$eval('.stage', e => (e as HTMLElement).dataset.camera), beforeDrag);
      assert.equal(await page.$eval('.stage', e => Number((e as HTMLElement).dataset.ownerCount)), ownerCount);
      await page.select('select[aria-label="Projeto"]', project === 'bc' ? 'cadisk' : 'bc');
      await page.waitForSelector('html[data-ready="true"]');
      await page.waitForFunction(expected => Number(document.querySelector<HTMLElement>('.stage')?.dataset.ownerCount) === expected, {}, project === 'bc' ? 74 : 66);
      console.log(`${candidate}/${project}: navigation and keyboard passed`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
