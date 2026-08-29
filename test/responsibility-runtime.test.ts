import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import type { ResponsibilityDetector } from '../packages/analyzer-typescript/src/responsibility-detectors/detector.js';
import { analyzeResponsibilitiesWithSession } from '../packages/analyzer-typescript/src/responsibility-detectors/runtime.js';
import { createTypeScriptAnalysisSession } from '../packages/analyzer-typescript/src/typescript-analysis-session.js';

const fixturePath = path.resolve('fixtures/simple-import');

test('aggregates deterministic detector outcomes without reparsing the TypeScript session', () => {
  const session = createTypeScriptAnalysisSession(fixturePath, [path.join(fixturePath, 'tsconfig.json')], () => true);
  const mainSourceFile = session.sourceFiles.get('src/main.ts');

  assert.ok(mainSourceFile);
  assert.deepEqual(session.locationFor(mainSourceFile), { filePath: 'src/main.ts', line: 1, column: 1 });
  const subject = { id: 'subject:src/main.ts:function:main', kind: 'function' as const, fileId: 'src/main.ts', symbolId: 'main', name: 'main', location: { filePath: 'src/main.ts', line: 1, column: 1 } };
  const detectors: ResponsibilityDetector[] = [
    {
      detector: { id: 'test.http', version: '1' },
      capability: 'http-entry-point',
      analyze: () => ({
        status: 'evaluated',
        findings: [{ id: 'finding:http', subject, responsibility: 'http-entry-point', confidence: 'exact', provenance: { detector: { id: 'test.http', version: '1' }, ruleId: 'route', ruleVersion: '1' }, evidence: [{ id: 'evidence:http', kind: 'annotation', technology: { id: 'test', displayName: 'Test' }, signal: '@Route()', location: subject.location }] }],
        limitations: [],
      }),
    },
    { detector: { id: 'test.http.extra', version: '1' }, capability: 'http-entry-point', analyze: () => ({ status: 'evaluated', findings: [], limitations: [] }) },
    {
      detector: { id: 'test.access', version: '1' },
      capability: 'access-control',
      analyze: () => ({ status: 'partially-evaluated', findings: [{ id: 'finding:access', subject, responsibility: 'access-control', confidence: 'inferred', provenance: { detector: { id: 'test.access', version: '1' }, ruleId: 'guard', ruleVersion: '1' }, evidence: [{ id: 'evidence:access', kind: 'annotation', technology: { id: 'test', displayName: 'Test' }, signal: '@Guard()', location: subject.location }] }], limitations: [{ id: 'limitation:access', scope: { kind: 'subject', subjectId: subject.id, fileId: subject.fileId }, code: 'partial', message: 'Partial support.' }] }),
    },
    { detector: { id: 'test.websocket', version: '1' }, capability: 'websocket-entry-point', analyze: () => ({ status: 'not-applicable', findings: [], limitations: [] }) },
    { detector: { id: 'test.rpc', version: '1' }, capability: 'rpc-entry-point', analyze: () => ({ status: 'failed', findings: [], limitations: [], failure: { code: 'failed', message: 'Failure.' } }) },
    { detector: { id: 'test.cache', version: '1' }, capability: 'cache-interaction', analyze: () => ({ status: 'evaluated', findings: [], limitations: [] }) },
  ];

  const first = analyzeResponsibilitiesWithSession(session, detectors);
  const second = analyzeResponsibilitiesWithSession(session, detectors);
  const coverage = new Map(first.coverage.map((item) => [item.capability, item]));

  assert.deepEqual(first, second);
  assert.equal(first.findings.length, 2);
  assert.deepEqual(coverage.get('http-entry-point'), { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] });
  assert.equal(coverage.get('access-control')?.status, 'partially-evaluated');
  assert.equal(coverage.get('websocket-entry-point')?.status, 'unsupported');
  assert.equal(coverage.get('rpc-entry-point')?.status, 'failed');
  assert.deepEqual(coverage.get('cache-interaction'), { capability: 'cache-interaction', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] });
  assert.equal(first.detectorExecutions.find((execution) => execution.detector.id === 'test.http')?.findingIds[0], 'finding:http');
});
