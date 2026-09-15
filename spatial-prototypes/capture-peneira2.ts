import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:5184';
const output = path.resolve('spatial-prototypes/captures/peneira2');
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: '/usr/bin/firefox', headless: true });
const results: object[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  for (const candidate of ['hyperbolic', 'hyperbolic-skeleton', 'hyperbolic-foveated', 'wildcard']) {
    for (const project of ['bc', 'cadisk', 'bm']) {
      await page.goto(`${base}/?candidate=${candidate}&project=${project}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('html[data-ready="true"]');
      const baseline = candidate === 'hyperbolic';
      let disclosureToFind = 0;
      async function capture(state: string) {
        await page.screenshot({ path: path.join(output, `${candidate}-${project}-${state}.png`) });
        results.push(await page.evaluate(({ candidate, project, state, disclosureToFind, baseline }) => {
          const stage = document.querySelector<HTMLElement>('.stage');
          const entities = [...document.querySelectorAll<HTMLElement>(baseline ? '.stage [data-id]' : '.lens-place')];
          const clipped = entities.filter(e => e.dataset.labelVisible !== 'false' && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)).map(e => e.dataset.id ?? e.dataset.entity);
          const overlaps = entities.flatMap((e, i) => entities.slice(i + 1).flatMap(other => {
            const a = e.getBoundingClientRect(), b = other.getBoundingClientRect();
            return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 ? [[e.dataset.id ?? e.dataset.entity, other.dataset.id ?? other.dataset.entity]] : [];
          }));
          return { candidate, project, state, disclosureToFind, ...stage?.dataset,
            entitiesDrawn: entities.length, labelsVisible: entities.filter(e => e.dataset.labelVisible !== 'false').length,
            aggregates: entities.filter(e => e.dataset.aggregate === 'true').length,
            contextualWithoutLabel: entities.filter(e => e.dataset.labelVisible === 'false').length,
            clipped, overlaps, children: entities.filter(e => e.dataset.role === 'child').map(e => e.dataset.id) };
        }, { candidate, project, state, disclosureToFind, baseline }));
      }
      async function enter(id: string, keyboard = false) {
        const selector = `.stage [data-id="${id}"]`;
        let attempts = 0;
        while (!await page.$(selector) && !baseline && attempts++ < 20) {
          await page.click('[data-action="next-window"]'); disclosureToFind++;
        }
        await page.waitForSelector(selector);
        if (keyboard) { await page.$eval(selector, el => { if (el instanceof HTMLElement || el instanceof SVGElement) el.focus(); }); await page.keyboard.press('Enter'); }
        else await page.click(selector);
        await page.waitForFunction(id => document.querySelector<HTMLElement>('.stage')?.dataset.focus === id, {}, id);
      }
      await capture('macro');
      if (project === 'bc') {
        await enter('directory:packages', true);
        await capture('packages');
        await enter('directory:packages/graph-engine', true);
        await capture('graph-engine');
        await page.keyboard.press('Backspace');
        assert.equal(await page.$eval('.stage', e => (e as HTMLElement).dataset.focus), 'directory:packages');
        await page.click('[data-action="system"]');
        await enter('directory:apps'); await enter('directory:apps/explorer-web'); await enter('directory:apps/explorer-web/src');
        await capture('explorer-src');
        if (!baseline) {
          const before = await page.$eval('.stage', e => (e as HTMLElement).dataset.representatives);
          const capacity = await page.$eval('.stage', e => Number((e as HTMLElement).dataset.capacity));
          const seen = new Set<string>();
          for (let i = 0; i < Math.ceil(36 / capacity); i++) {
            await capture(`explorer-src-window-${i + 1}`);
            assert.equal(await page.$$eval('.lens-place', es => es.filter(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).length), 0, 'Named children must fit in every window');
            for (const id of await page.$$eval('.lens-child', es => es.map(e => (e as HTMLElement).dataset.id ?? ''))) seen.add(id);
            await page.focus('.stage'); await page.keyboard.press('PageDown');
            assert.equal(await page.$eval('.stage', e => (e as HTMLElement).dataset.representatives), before);
          }
          assert.equal(seen.size, 36, 'Every src child must be reachable without search');
          if (candidate === 'wildcard') {
            await page.focus('.stage'); await page.keyboard.press('ArrowRight');
            assert.equal(await page.$eval('.stage', e => (e as HTMLElement).dataset.offset), '1');
            await page.mouse.move(560, 450); await page.mouse.wheel({ deltaY: 100 });
            await page.waitForFunction(() => Number(document.querySelector<HTMLElement>('.stage')?.dataset.offset) > 1);
          }
        }
      } else {
        if (project === 'bm') { await enter('directory:src'); await capture('src'); }
        await enter('directory:src/auth', true); await capture('auth');
        await enter('src/auth/auth.service.ts', true);
        if (!baseline) await page.focus('.lens-focus');
        await page.keyboard.press(' ');
        assert.ok(await page.$('.relations h3'));
        await capture('file-relations');
        if (!baseline) {
          assert.ok(await page.$('.lens-place[data-uses="true"], .lens-place[data-used-by="true"]'), 'Relation destinations must highlight places or aggregates');
          const target = await page.$('.relations [data-relation-target]');
          if (target) {
            const id = await target.evaluate(e => (e as HTMLElement).dataset.relationTarget);
            await target.click();
            assert.equal(await page.$eval('.stage', e => (e as HTMLElement).dataset.focus), id);
            // Return through the factual path to the same file, not a search-only shortcut.
            await page.click('[data-action="system"]');
            if (project === 'bm') await enter('directory:src');
            await enter('directory:src/auth'); await enter('src/auth/auth.service.ts');
          }
        }
        await page.focus('.stage'); await page.keyboard.press('Backspace');
        assert.equal(await page.$eval('.stage', e => (e as HTMLElement).dataset.focus), 'directory:src/auth');
        await enter('src/auth/auth.service.ts');
        await page.keyboard.press('Backspace');
        if (project === 'cadisk') {
          await page.keyboard.press('Backspace');
          await enter('directory:src/case'); await capture('case');
          await page.keyboard.press('Backspace');
          await enter('directory:src/user'); await capture('distant-sibling');
        }
      }
      assert.equal(await page.$eval('.stage', e => Number((e as HTMLElement).dataset.ownerCount)), project === 'bc' ? 66 : project === 'cadisk' ? 74 : 36);
      await page.focus('.stage'); await page.keyboard.press('Home');
      await page.select('select[aria-label="Projeto"]', project === 'bc' ? 'cadisk' : 'bc');
      await page.waitForFunction(expected => Number(document.querySelector<HTMLElement>('.stage')?.dataset.ownerCount) === expected, {}, project === 'bc' ? 74 : 66);
      console.log(`${candidate}/${project}: mouse, keyboard, return, relations, project switch passed`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
