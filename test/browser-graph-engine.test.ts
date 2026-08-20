import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import * as esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';
import { buildProjectGraph, createImpactReport, createProjectDiagnostics } from '../packages/graph-engine/src/index.js';

const repoRoot = path.resolve('.');
const datasetPath = path.join(repoRoot, 'packages/analyzer-typescript');
const impactTarget = 'src/analysis-result.ts';
const firefoxExecutablePath = process.env.BUNKERCODE_BROWSER_EXECUTABLE ?? '/usr/bin/firefox';

interface BrowserGraphEngineResult {
  graph: unknown;
  diagnostics: unknown;
  impact: unknown;
  timings: {
    graphMs: number;
    diagnosticsMs: number;
    impactMs: number;
    totalMs: number;
  };
}

interface BrowserState {
  result: BrowserGraphEngineResult | null;
  error: string | null;
}

test('browser build reconstructs the snapshot boundary', { timeout: 60000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== '1') {
    t.skip('Set BUNKERCODE_BROWSER_TEST=1 to run the Firefox browser compatibility test.');
    return;
  }

  if (!existsSync(firefoxExecutablePath)) {
    throw new Error(`Firefox executable not found: ${firefoxExecutablePath}`);
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-browser-test-'));
  const browserHtmlPath = path.join(tempDir, 'index.html');
  const browserBundlePath = path.join(tempDir, 'spike.bundle.js');
  const analysis = analyzeProject(datasetPath);
  const snapshot = JSON.parse(JSON.stringify(analysis));
  const snapshotJson = JSON.stringify(snapshot);

  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const nodeGraph = buildProjectGraph(snapshot);
  const nodeDiagnostics = createProjectDiagnostics(nodeGraph);
  const nodeImpact = createImpactReport(nodeGraph, impactTarget);

  const browserSource = `
    import { buildProjectGraph, createProjectDiagnostics, createImpactReport } from './packages/graph-engine/src/index.ts';

    try {
      const snapshot = JSON.parse(globalThis.__SNAPSHOT_JSON__);
      const target = globalThis.__TARGET__;
      const started = performance.now();
      const graphStarted = performance.now();
      const graph = buildProjectGraph(snapshot);
      const graphMs = performance.now() - graphStarted;
      const diagnosticsStarted = performance.now();
      const diagnostics = createProjectDiagnostics(graph);
      const diagnosticsMs = performance.now() - diagnosticsStarted;
      const impactStarted = performance.now();
      const impact = createImpactReport(graph, target);
      const impactMs = performance.now() - impactStarted;

      globalThis.__RESULT__ = {
        graph,
        diagnostics,
        impact,
        timings: {
          graphMs,
          diagnosticsMs,
          impactMs,
          totalMs: performance.now() - started,
        },
      };
    } catch (error) {
      globalThis.__ERROR__ = error instanceof Error ? (error.stack || error.message) : String(error);
    }
  `;

  await esbuild.build({
    stdin: {
      contents: browserSource,
      resolveDir: repoRoot,
      sourcefile: 'browser-spike.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    outfile: browserBundlePath,
    metafile: true,
    sourcemap: false,
    minify: false,
  });

  const bundleText = readFileSync(browserBundlePath, 'utf8');
  assert.equal(bundleText.includes('node:fs') || bundleText.includes('node:path') || bundleText.includes('ts-morph'), false);
  assert.ok(statSync(browserBundlePath).size > 0);

  writeFileSync(
    browserHtmlPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <script>
      globalThis.__SNAPSHOT_JSON__ = ${JSON.stringify(snapshotJson)};
      globalThis.__TARGET__ = ${JSON.stringify(impactTarget)};
      globalThis.__RESULT__ = null;
      globalThis.__ERROR__ = null;
      window.addEventListener('error', (event) => {
        globalThis.__ERROR__ = event?.error ? (event.error.stack || String(event.error)) : String(event?.message || 'unknown error');
      });
    </script>
    <script type="module" src="./spike.bundle.js"></script>
  </head>
  <body>browser spike</body>
</html>
`,
  );

  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: firefoxExecutablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.goto(pathToFileURL(browserHtmlPath).href, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__RESULT__ !== null || globalThis.__ERROR__ !== null, {
      timeout: 15000,
    });

    const state = JSON.parse(
      await page.evaluate(() => JSON.stringify({ result: globalThis.__RESULT__, error: globalThis.__ERROR__ })),
    ) as BrowserState;

    assert.equal(state.error, null);
    assert.ok(state.result);
    assert.deepEqual(state.result.graph, nodeGraph);
    assert.deepEqual(state.result.diagnostics, nodeDiagnostics);
    assert.deepEqual(state.result.impact, nodeImpact);
    assert.ok(state.result.timings.graphMs >= 0);
    assert.ok(state.result.timings.diagnosticsMs >= 0);
    assert.ok(state.result.timings.impactMs >= 0);
    assert.ok(state.result.timings.totalMs >= 0);
    assert.deepEqual(nodeImpact.directDependents.map((node) => node.id), [
      'src/analyze-project.ts',
      'src/index.ts',
      'src/pnpm-workspace.ts',
    ]);
    assert.equal(nodeImpact.totalAffected, 3);
  } finally {
    await browser.close();
  }
});
