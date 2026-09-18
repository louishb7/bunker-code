import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { ResponsibilityDetector } from '../packages/analyzer-typescript/src/responsibility-detectors/detector.js';
import { analyzeResponsibilitiesWithSession } from '../packages/analyzer-typescript/src/responsibility-detectors/runtime.js';
import { createTypeScriptAnalysisSession } from '../packages/analyzer-typescript/src/typescript-analysis-session.js';
import { analyzeProject, analyzeTypeScriptTarget } from '../packages/analyzer-typescript/src/index.js';
import type { ObservedResponsibilityClaim, ObservedResponsibilityContext, ObservedResponsibilityUnit, ResponsibilityAnalysisResult, ResponsibilityFinding, ResponsibilitySubject } from '../packages/contracts/src/index.js';
import { deriveObservedResponsibilityClaims, deriveObservedResponsibilityFileParts } from '../packages/analyzer-typescript/src/observed-responsibility-model.js';
import {
  createObservedResponsibilityUnit,
  findObservedResponsibilityCoverage,
  findObservedResponsibilityExecutions,
  resolveObservedResponsibilityFile,
  resolveObservedResponsibilityLimitations,
  resolveObservedResponsibilitySupports,
} from '../packages/analyzer-typescript/src/observed-responsibility-unit.js';

const fixturePath = path.resolve('fixtures/simple-import');
const observedContext: ObservedResponsibilityContext = {
  profile: 'static-responsibility', nature: 'derived-from-static-analysis',
  representedTarget: 'test-target', implementationState: 'loaded-production',
};

test('builds empty and unsupported static units and rejects broken source contracts', () => {
  const { analysis, responsibilities } = analyzeTypeScriptTarget(fixturePath);
  const before = structuredClone({ analysis, responsibilities, observedContext });
  const unit = createObservedResponsibilityUnit(analysis, responsibilities, observedContext);
  assert.strictEqual(unit.sources.analysis, analysis);
  assert.strictEqual(unit.sources.responsibilities, responsibilities);
  assert.equal(unit.model.parts.length, 2);
  assert.deepEqual(unit.model.claims, []);
  assert.equal(findObservedResponsibilityCoverage(unit, 'http-entry-point', { kind: 'project' })?.status, 'unsupported');
  assert.equal(findObservedResponsibilityExecutions(unit, 'http-entry-point', { kind: 'project' })[0]?.status, 'not-applicable');
  assert.equal(findObservedResponsibilityCoverage(unit, 'http-entry-point', { kind: 'file', fileId: 'src/main.ts' }), undefined);
  assert.deepEqual(findObservedResponsibilityExecutions(unit, 'http-entry-point', { kind: 'file', fileId: 'src/main.ts' }), []);
  assert.equal(JSON.stringify(createObservedResponsibilityUnit(analysis, responsibilities, observedContext)), JSON.stringify(unit));
  const other = createObservedResponsibilityUnit(analysis, responsibilities, { ...observedContext, representedTarget: 'another-local-target' });
  assert.notDeepEqual(other.context, unit.context);
  assert.deepEqual(other.model, unit.model);
  assert.deepEqual({ analysis, responsibilities, observedContext }, before);
  const empty = createObservedResponsibilityUnit({ ...analysis, files: [], dependencies: [] }, responsibilities, observedContext);
  assert.deepEqual(empty.model, { parts: [], claims: [] });
  assert.deepEqual(empty.sources.responsibilities.coverage, responsibilities.coverage);

  const execution = responsibilities.detectorExecutions[0];
  assert.ok(execution);
  const limitation = { id: 'limit', scope: { kind: 'project' as const }, code: 'test', message: 'Test limitation.' };
  const invalidSources: [ResponsibilityAnalysisResult, string][] = [
    [{ ...responsibilities, detectorExecutions: [execution, execution] }, `Duplicate detector execution ID: ${execution.id}`],
    [{ ...responsibilities, limitations: [limitation, limitation] }, 'Duplicate responsibility limitation ID: limit'],
    [{ ...responsibilities, coverage: [{ capability: 'http-entry-point', scope: { kind: 'project' }, status: 'partially-evaluated', limitationIds: ['missing'] }] }, 'Missing responsibility limitation: missing'],
    [{ ...responsibilities, detectorExecutions: [{ ...execution, status: 'partially-evaluated', findingIds: [], limitationIds: ['missing'] }] }, 'Missing responsibility limitation: missing'],
    [{ ...responsibilities, detectorExecutions: [{ ...execution, status: 'evaluated', findingIds: ['missing'], limitationIds: [] }] }, 'Missing execution finding: missing'],
    [{ ...responsibilities, coverage: [...responsibilities.coverage, ...responsibilities.coverage] }, 'Duplicate responsibility coverage scope: access-control'],
  ];
  for (const [source, message] of invalidSources) {
    assert.throws(() => createObservedResponsibilityUnit(analysis, source, observedContext), { message });
  }
  assert.throws(() => createObservedResponsibilityUnit({ ...analysis, schemaVersion: JSON.parse('2') }, responsibilities, observedContext), /Unsupported analysis schema/);
  assert.throws(() => createObservedResponsibilityUnit(analysis, { ...responsibilities, schemaVersion: JSON.parse('2') }, observedContext), /Unsupported responsibility schema/);
  assert.throws(() => createObservedResponsibilityUnit(analysis, responsibilities, { ...observedContext, profile: JSON.parse('"runtime"') }), /Invalid observed Responsibility context/);
  assert.throws(() => createObservedResponsibilityUnit(analysis, { ...responsibilities, projectPath: 'other' }, observedContext), /Inconsistent observed Responsibility source metadata/);
});

test('groups static claims independently of finding identity and epistemic records', () => {
  const subject = { id: 'subject:"users\\list"', kind: 'method' as const, fileId: 'src/users.ts', symbolId: 'Users.list', name: 'list', location: { filePath: 'src/users.ts', line: 3, column: 1 } };
  const first: ResponsibilityFinding = {
    id: 'finding:z', subject, responsibility: 'http-entry-point', confidence: 'exact',
    provenance: { detector: { id: 'test.http', version: '1' }, ruleId: 'route', ruleVersion: '1' },
    evidence: [{ id: 'evidence:first', kind: 'annotation', technology: { id: 'test', displayName: 'Test' }, signal: '@Route()', location: subject.location }],
  };
  const variants: ResponsibilityFinding[] = [
    { ...first, id: 'finding:rule', provenance: { ...first.provenance, ruleVersion: '2' } },
    { ...first, id: 'finding:rule-id', provenance: { ...first.provenance, ruleId: 'other-route' } },
    { ...first, id: 'finding:detector-version', provenance: { ...first.provenance, detector: { ...first.provenance.detector, version: '2' } } },
    { ...first, id: 'finding:confidence', confidence: 'inferred' },
    { ...first, id: 'finding:detector', provenance: { detector: { id: 'other', version: '7' }, ruleId: 'other-rule', ruleVersion: '9' } },
    { ...first, id: 'finding:evidence', evidence: [{ ...first.evidence[0]!, id: 'evidence:other', signal: '@OtherRoute()' }] },
  ];
  const parts = [{ fileId: subject.fileId }];
  const base = deriveObservedResponsibilityClaims([first], parts)[0];
  assert.ok(base);
  assert.deepEqual(JSON.parse(base.key), ['static-responsibility', subject.id, first.responsibility]);
  for (const variant of variants) {
    assert.equal(deriveObservedResponsibilityClaims([variant], parts)[0]?.key, base.key);
    const grouped = deriveObservedResponsibilityClaims([first, variant], parts);
    assert.equal(grouped.length, 1);
    assert.deepEqual(grouped[0]?.supports.map((support) => support.findingId), [first.id, variant.id].sort());
  }
  const findings = [...variants, first, { ...first, id: 'finding:access', responsibility: 'access-control' as const }];
  const before = structuredClone({ findings, parts });
  const claims = deriveObservedResponsibilityClaims(findings, parts);
  assert.equal(claims.length, 2);
  assert.notEqual(claims[0]?.key, claims[1]?.key);
  assert.deepEqual(claims.map((claim) => claim.key), claims.map((claim) => claim.key).sort());
  assert.deepEqual(deriveObservedResponsibilityClaims([...findings].reverse(), parts), claims);
  assert.deepEqual({ findings, parts }, before);

  const parsedClaims: ObservedResponsibilityClaim[] = JSON.parse(JSON.stringify(claims));
  const parsedFindings: ResponsibilityFinding[] = JSON.parse(JSON.stringify(findings));
  assert.deepEqual(parsedClaims, claims);
  const supportedIds = parsedClaims.flatMap((claim) => claim.supports.map((support) => {
    const source = parsedFindings.find((finding) => finding.id === support.findingId);
    assert.ok(source);
    assert.deepEqual(claim.subject, { kind: source.subject.kind, subjectId: source.subject.id, fileId: source.subject.fileId });
    assert.equal(claim.responsibility, source.responsibility);
    return source.id;
  }));
  assert.deepEqual(supportedIds.sort(), findings.map((finding) => finding.id).sort());
  assert.deepEqual(parsedClaims.find((claim) => claim.key === base.key), {
    key: base.key, subject: base.subject, responsibility: first.responsibility,
    supports: [first, ...variants].map((finding) => finding.id).sort().map((findingId) => ({ findingId })),
  });
  assert.deepEqual(parsedFindings, findings);
  assert.deepEqual(deriveObservedResponsibilityClaims([], parts), []);
});

test('rejects ambiguous findings and broken file references before producing claims', () => {
  const subject = { id: 'subject:users', kind: 'method' as const, fileId: 'src/users.ts', symbolId: 'Users.list', name: 'list', location: { filePath: 'src/users.ts', line: 3, column: 1 } };
  const finding: ResponsibilityFinding = { id: 'finding:users', subject, responsibility: 'http-entry-point', confidence: 'exact', provenance: { detector: { id: 'test', version: '1' }, ruleId: 'route', ruleVersion: '1' }, evidence: [] };
  const parts = [{ fileId: subject.fileId }, { fileId: 'src/other.ts' }];
  assert.throws(() => deriveObservedResponsibilityClaims([finding], []), { message: 'Responsibility subject references missing File Part: src/users.ts' });
  for (const duplicate of [finding, { ...finding, responsibility: 'access-control' as const }]) {
    assert.throws(() => deriveObservedResponsibilityClaims([finding, duplicate], parts), { message: 'Duplicate responsibility finding ID: finding:users' });
  }
  const conflicts: ResponsibilitySubject[] = [
    { ...subject, kind: 'class' },
    { ...subject, kind: 'file' },
    { ...subject, fileId: 'src/other.ts' },
    { ...subject, location: { ...subject.location, filePath: 'src/other.ts' } },
    { ...subject, location: { ...subject.location, line: 4 } },
    { ...subject, location: { ...subject.location, column: 2 } },
    { ...subject, symbolId: 'Users.other' },
    { ...subject, name: 'other' },
  ];
  for (const conflict of conflicts) {
    const inputs = [finding, { ...finding, id: 'finding:other', subject: conflict }];
    const before = structuredClone(inputs);
    assert.throws(() => deriveObservedResponsibilityClaims(inputs, parts), { message: 'Conflicting responsibility subject: subject:users' });
    assert.deepEqual(inputs, before);
  }
  const differentSubject = { ...finding, id: 'finding:distinct', subject: { ...subject, id: 'subject:distinct' } };
  assert.equal(deriveObservedResponsibilityClaims([finding, differentSubject], parts).length, 2);
});

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
    { detector: { id: 'test.http.failed', version: '1' }, capability: 'http-entry-point', analyze: () => ({ status: 'failed', findings: [], limitations: [], failure: { code: 'failed', message: 'Failure.' } }) },
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
  assert.equal(coverage.get('http-entry-point')?.status, 'partially-evaluated');
  assert.equal(coverage.get('access-control')?.status, 'partially-evaluated');
  assert.equal(coverage.get('websocket-entry-point')?.status, 'unsupported');
  assert.equal(coverage.get('rpc-entry-point')?.status, 'failed');
  assert.deepEqual(coverage.get('cache-interaction'), { capability: 'cache-interaction', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] });
  const httpExecution = first.detectorExecutions.find((execution): execution is Extract<typeof execution, { status: 'evaluated' }> => execution.detector.id === 'test.http' && execution.status === 'evaluated');
  assert.equal(httpExecution?.findingIds[0], 'finding:http');
  const analysis = analyzeProject(fixturePath);
  const original = structuredClone(first);
  const unit: ObservedResponsibilityUnit = JSON.parse(JSON.stringify(createObservedResponsibilityUnit(analysis, first, observedContext)));
  const partial = findObservedResponsibilityCoverage(unit, 'access-control', { kind: 'project' });
  assert.ok(partial);
  assert.equal(partial.status, 'partially-evaluated');
  assert.equal(unit.model.claims.length, 2);
  assert.equal(resolveObservedResponsibilityLimitations(unit, partial)[0]?.scope.kind, 'subject');
  const accessExecution = findObservedResponsibilityExecutions(unit, 'access-control', { kind: 'project' })[0];
  assert.ok(accessExecution);
  assert.equal(resolveObservedResponsibilityLimitations(unit, accessExecution)[0]?.id, 'limitation:access');
  const failed = findObservedResponsibilityCoverage(unit, 'rpc-entry-point', { kind: 'project' });
  assert.ok(failed && failed.status === 'failed');
  assert.deepEqual(failed.failure, { code: 'failed', message: 'Failure.' });
  assert.equal(resolveObservedResponsibilityLimitations(unit, failed).length, 1);
  assert.deepEqual(first, original);
  assert.ok(httpExecution);
  for (const inconsistent of [
    { ...httpExecution, capability: 'access-control' as const },
    { ...httpExecution, detector: { ...httpExecution.detector, id: 'other' } },
    { ...httpExecution, detector: { ...httpExecution.detector, version: '2' } },
    { ...httpExecution, scope: { kind: 'subject' as const, fileId: subject.fileId, subjectId: 'other' } },
  ]) {
    assert.throws(() => createObservedResponsibilityUnit(analysis, { ...first, detectorExecutions: [inconsistent] }, observedContext), /Inconsistent execution finding: finding:http/);
  }
  const notEvaluated = { ...first, findings: [], detectorExecutions: [], coverage: [{ capability: 'http-entry-point' as const, scope: { kind: 'project' as const }, status: 'not-evaluated' as const }] };
  const pending = createObservedResponsibilityUnit(analysis, notEvaluated, observedContext);
  assert.equal(findObservedResponsibilityCoverage(pending, 'http-entry-point', { kind: 'project' })?.status, 'not-evaluated');
  const scoped = createObservedResponsibilityUnit(analysis, {
    ...notEvaluated,
    coverage: [
      { capability: 'http-entry-point', scope: { kind: 'file', fileId: subject.fileId }, status: 'evaluated', limitationIds: [] },
      { capability: 'http-entry-point', scope: { kind: 'subject', fileId: subject.fileId, subjectId: subject.id }, status: 'not-evaluated' },
    ],
    detectorExecutions: [{ ...httpExecution, scope: { kind: 'file', fileId: subject.fileId }, findingIds: [] }],
  }, observedContext);
  assert.equal(findObservedResponsibilityCoverage(scoped, 'http-entry-point', { kind: 'file', fileId: subject.fileId })?.status, 'evaluated');
  assert.equal(findObservedResponsibilityCoverage(scoped, 'http-entry-point', { kind: 'subject', fileId: subject.fileId, subjectId: subject.id })?.status, 'not-evaluated');
  assert.equal(findObservedResponsibilityCoverage(scoped, 'http-entry-point', { kind: 'subject', fileId: subject.fileId, subjectId: 'other' }), undefined);
  assert.equal(findObservedResponsibilityExecutions(scoped, 'http-entry-point', { kind: 'file', fileId: subject.fileId }).length, 1);
});

test('preserves every deterministic failure cause when no detector evaluates a capability', () => {
  const session = createTypeScriptAnalysisSession(fixturePath, [path.join(fixturePath, 'tsconfig.json')], () => true);
  const detectors: ResponsibilityDetector[] = [
    { detector: { id: 'test.failure-a', version: '1' }, capability: 'rpc-entry-point', analyze: () => ({ status: 'failed', findings: [], limitations: [], failure: { code: 'a', message: 'Failure A.' } }) },
    { detector: { id: 'test.failure-b', version: '1' }, capability: 'rpc-entry-point', analyze: () => ({ status: 'failed', findings: [], limitations: [], failure: { code: 'b', message: 'Failure B.' } }) },
  ];
  const first = analyzeResponsibilitiesWithSession(session, detectors);
  const reversed = analyzeResponsibilitiesWithSession(session, [...detectors].reverse());
  const coverage = first.coverage.find((item) => item.capability === 'rpc-entry-point');

  assert.deepEqual(first, reversed);
  assert.equal(coverage?.status, 'failed');
  assert.equal(first.limitations.filter((limitation) => limitation.code === 'detector-failed').length, 2);
  assert.equal(first.limitations.some((limitation) => limitation.message.includes('Failure A.')), true);
  assert.equal(first.limitations.some((limitation) => limitation.message.includes('Failure B.')), true);
});

test('detects NestJS decorators through imported aliases without a NestJS dependency', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-nest-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', experimentalDecorators: true }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/main.ts'), "import { Controller as C, Get as Read, UseGuards as Guard, Module as Wiring } from '@nestjs/common'; @Wiring({}) class AppModule {} @C('users') @Guard(AuthGuard) class Users { @Read() @Guard(AuthGuard) list() {} } class AuthGuard {}\n");
  const first = analyzeTypeScriptTarget(projectPath);
  const second = analyzeTypeScriptTarget(projectPath);
  const responsibilities = first.responsibilities.findings.map((finding) => finding.responsibility).sort();

  assert.deepEqual(first, second);
  assert.deepEqual(first.analysis, analyzeProject(projectPath));
  assert.deepEqual(responsibilities, ['access-control', 'access-control', 'framework-wiring', 'http-entry-point']);
  const parts = deriveObservedResponsibilityFileParts(first.analysis);
  const claims = deriveObservedResponsibilityClaims(first.responsibilities.findings, parts);
  assert.deepEqual(parts, [{ fileId: 'src/main.ts' }]);
  assert.equal(claims.length, 4);
  const methodClaims = claims.filter((claim) => claim.subject.kind === 'method');
  assert.deepEqual(methodClaims.map((claim) => claim.responsibility).sort(), ['access-control', 'http-entry-point']);
  assert.equal(new Set(methodClaims.map((claim) => claim.subject.subjectId)).size, 1);
  assert.equal(claims.filter((claim) => claim.subject.kind === 'class').length, 2);
  assert.equal(first.responsibilities.findings.find((finding) => finding.responsibility === 'http-entry-point')?.evidence[0]?.technology.id, 'nestjs');
  const beforeUnit = structuredClone(first);
  const unit = createObservedResponsibilityUnit(first.analysis, first.responsibilities, observedContext);
  const parsed: ObservedResponsibilityUnit = JSON.parse(JSON.stringify(unit));
  assert.deepEqual(parsed, unit);
  for (const part of parsed.model.parts) {
    assert.deepEqual(resolveObservedResponsibilityFile(parsed, part.fileId), first.analysis.files.find((file) => file.id === part.fileId));
  }
  for (const claim of parsed.model.claims) {
    for (const support of resolveObservedResponsibilitySupports(parsed, claim)) {
      const source = first.responsibilities.findings.find((finding) => finding.id === support.id);
      assert.ok(source);
      assert.deepEqual(support.subject, source.subject);
      assert.deepEqual(support.evidence, source.evidence);
      assert.deepEqual(support.provenance, source.provenance);
      assert.equal(support.confidence, source.confidence);
    }
  }
  assert.deepEqual(first, beforeUnit);
});

test('keeps combined analysis equivalent for a PNPM workspace target', () => {
  const workspacePath = path.resolve('fixtures/pnpm-workspace-structure');
  const first = analyzeTypeScriptTarget(workspacePath);
  const second = analyzeTypeScriptTarget(workspacePath);

  assert.deepEqual(first.analysis, analyzeProject(workspacePath));
  assert.deepEqual(first, second);
});

test('does not infer NestJS responsibilities from names, local decorators, or other packages', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-nest-negative-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', experimentalDecorators: true }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/users.controller.ts'), "function Controller(): ClassDecorator { return () => {}; } function Get(): MethodDecorator { return () => {}; } function UseGuards(): ClassDecorator { return () => {}; } function Module(): ClassDecorator { return () => {}; } @Controller() class UsersController { @Get() list() {} } @UseGuards() class AuthGuard {} @Module() class UsersModule {}\n");
  writeFileSync(path.join(projectPath, 'src/other.ts'), "import { Controller, Get, UseGuards, Module } from 'other-package'; @Controller() class Other { @Get() list() {} @UseGuards() secure() {} } @Module() class OtherModule {}\n");
  const result = analyzeTypeScriptTarget(projectPath).responsibilities;
  assert.deepEqual(result.findings, []);
  assert.equal(result.detectorExecutions.every((execution) => execution.status === 'not-applicable'), true);
});

test('keeps NestJS capabilities evaluated with zero findings when supported signals are absent', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-nest-zero-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', experimentalDecorators: true }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/main.ts'), "import { Controller } from '@nestjs/common'; @Controller() class Users {}\n");
  const target = analyzeTypeScriptTarget(projectPath);
  const result = target.responsibilities;
  const unit = createObservedResponsibilityUnit(target.analysis, result, observedContext);
  assert.equal(unit.model.parts.length, 1);
  assert.deepEqual(unit.model.claims, []);
  assert.equal(findObservedResponsibilityCoverage(unit, 'http-entry-point', { kind: 'project' })?.status, 'evaluated');
  const coverage = new Map(result.coverage.map((item) => [item.capability, item]));
  assert.equal(result.findings.length, 0);
  assert.equal(coverage.get('http-entry-point')?.status, 'evaluated');
  assert.equal(coverage.get('access-control')?.status, 'evaluated');
  assert.equal(coverage.get('framework-wiring')?.status, 'evaluated');
});

test('supports NestJS namespace imports', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-nest-namespace-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', experimentalDecorators: true }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/main.ts'), "import * as Nest from '@nestjs/common'; @Nest.Controller() class Users { @Nest.Get() list() {} }\n");
  assert.equal(analyzeTypeScriptTarget(projectPath).responsibilities.findings.some((finding) => finding.responsibility === 'http-entry-point'), true);
});

test('detects direct PrismaClient operations once per function subject with ordered evidence', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-prisma-direct-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/main.ts'), "import { PrismaClient as Client } from '@prisma/client'; const prisma = new Client(); async function listUsers() { await prisma.user.findMany(); return prisma.order.create({ data: {} }); } prisma.user.count(); prisma.user.customThing();\n");

  const first = analyzeTypeScriptTarget(projectPath);
  const second = analyzeTypeScriptTarget(projectPath);
  const findings = first.responsibilities.findings.filter((finding) => finding.responsibility === 'persistence-interaction');
  const listUsers = findings.find((finding) => finding.subject.kind === 'function' && finding.subject.name === 'listUsers');

  assert.deepEqual(first, second);
  assert.deepEqual(first.analysis, analyzeProject(projectPath));
  assert.equal(findings.length, 2);
  assert.equal(listUsers?.confidence, 'exact');
  assert.deepEqual(listUsers?.provenance, { detector: { id: 'prisma.persistence', version: '1' }, ruleId: 'prisma-client-operation', ruleVersion: '1' });
  assert.equal(listUsers?.evidence.every((evidence) => evidence.technology.id === 'prisma'), true);
  assert.deepEqual(listUsers?.evidence.filter((evidence) => evidence.kind === 'call').map((evidence) => evidence.signal), ['prisma.order.create({ data: {} })', 'prisma.user.findMany()']);
  assert.equal(findings.some((finding) => finding.evidence.some((evidence) => evidence.signal.includes('customThing'))), false);
  assert.equal(findings.some((finding) => finding.subject.kind === 'file'), true);
  const parts = deriveObservedResponsibilityFileParts(first.analysis);
  const claims = deriveObservedResponsibilityClaims(findings, parts);
  assert.deepEqual(parts, [{ fileId: 'src/main.ts' }]);
  assert.deepEqual(claims.map((claim) => claim.subject.kind).sort(), ['file', 'function']);
  for (const claim of claims) {
    assert.equal(claim.subject.fileId, parts[0]?.fileId);
    const source = findings.find((finding) => finding.id === claim.supports[0]?.findingId);
    assert.ok(source);
    assert.equal(claim.subject.subjectId, source.subject.id);
  }
});

test('detects PrismaClient typed bindings, namespace imports, and direct local Prisma subclasses', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-prisma-bindings-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', experimentalDecorators: true }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/main.ts'), "import * as Prisma from '@prisma/client'; import { PrismaClient as Client } from '@prisma/client'; import { Controller, Get } from '@nestjs/common'; const namespaceClient = new Prisma.PrismaClient(); function namespaceLoad() { return namespaceClient.user.findMany(); } function load(client: Prisma.PrismaClient) { return client.user.findFirst(); } class PrismaService extends Client {} class TypedService { private readonly direct: Prisma.PrismaClient; listDirect() { return this.direct.user.count(); } } class UsersService { constructor(private readonly prisma: PrismaService) {} list() { return this.prisma.user.findMany(); } remove() { return this.prisma.user.delete({ where: { id: 1 } }); } } @Controller() class UsersController { @Get() list() {} }\n");

  const result = analyzeTypeScriptTarget(projectPath).responsibilities;
  const persistence = result.findings.filter((finding) => finding.responsibility === 'persistence-interaction');

  assert.deepEqual(persistence.map((finding) => finding.subject.kind === 'file' ? finding.subject.fileId : finding.subject.name).sort(), ['list', 'listDirect', 'load', 'namespaceLoad', 'remove']);
  assert.equal(persistence.every((finding) => finding.evidence.some((evidence) => evidence.signal.includes('PrismaClient'))), true);
  assert.equal(persistence.every((finding) => finding.evidence.some((evidence) => evidence.kind === 'call')), true);
  assert.equal(result.findings.some((finding) => finding.responsibility === 'http-entry-point'), true);
});

test('detects supported Prisma mutations and client operations from proved bindings', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-prisma-operations-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/main.ts'), "import { PrismaClient } from '@prisma/client'; const client = new PrismaClient(); function mutate() { client.user.update({}); client.user.delete({}); client.$transaction([]); client.$queryRaw('SELECT 1'); }\n");

  const finding = analyzeTypeScriptTarget(projectPath).responsibilities.findings.find((item) => item.responsibility === 'persistence-interaction' && item.subject.kind === 'function' && item.subject.name === 'mutate');

  assert.ok(finding);
  assert.deepEqual(finding.evidence.filter((evidence) => evidence.kind === 'call').map((evidence) => evidence.signal), ["client.$queryRaw('SELECT 1')", 'client.$transaction([])', 'client.user.delete({})', 'client.user.update({})']);
});

test('does not infer Prisma persistence from names, shapes, other packages, or imports without operations', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-prisma-negative-'));
  const noPrismaProjectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-prisma-none-'));
  context.after(() => { rmSync(projectPath, { recursive: true, force: true }); rmSync(noPrismaProjectPath, { recursive: true, force: true }); });
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/prisma.service.ts'), "import { PrismaClient } from '@prisma/client'; import { PrismaClient as OtherClient } from 'other-package'; import type { Prisma } from '@prisma/client'; class PrismaService {} class LocalClient {} const prisma = {}; const fake = { user: { findMany() {} } }; const other = new OtherClient(); const available = new PrismaClient(); function use(prisma: PrismaService) { prisma.user.findMany(); fake.user.findMany(); other.user.findMany(); }\n");
  writeFileSync(path.join(noPrismaProjectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(noPrismaProjectPath, 'src'));
  writeFileSync(path.join(noPrismaProjectPath, 'src/database.ts'), "import type { Prisma } from '@prisma/client'; class PrismaClient {} const prisma = new PrismaClient(); prisma.user.findMany();\n");

  const result = analyzeTypeScriptTarget(projectPath).responsibilities;
  const noPrismaResult = analyzeTypeScriptTarget(noPrismaProjectPath).responsibilities;
  const persistenceExecution = result.detectorExecutions.find((execution) => execution.detector.id === 'prisma.persistence');
  const noPrismaExecution = noPrismaResult.detectorExecutions.find((execution) => execution.detector.id === 'prisma.persistence');

  assert.deepEqual(result.findings.filter((finding) => finding.responsibility === 'persistence-interaction'), []);
  assert.equal(persistenceExecution?.status, 'evaluated');
  assert.equal(noPrismaExecution?.status, 'not-applicable');
  assert.equal(noPrismaResult.coverage.find((item) => item.capability === 'persistence-interaction')?.status, 'unsupported');
});

test('detects exported direct PrismaService bindings across files without coupling NestJS responsibility', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-prisma-cross-file-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', experimentalDecorators: true }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/prisma.service.ts'), "import { PrismaClient } from '@prisma/client'; export class PrismaService extends PrismaClient {}\n");
  writeFileSync(path.join(projectPath, 'src/users.service.ts'), "import { PrismaService } from './prisma.service'; export class UsersService { constructor(private readonly prisma: PrismaService) {} list() { return this.prisma.user.findMany(); } }\n");
  writeFileSync(path.join(projectPath, 'src/orders.service.ts'), "import { PrismaService as Database } from './prisma.service'; export class OrdersService { constructor(private readonly db: Database) {} create() { return this.db.order.create({ data: {} }); } }\n");
  writeFileSync(path.join(projectPath, 'src/users.controller.ts'), "import { Controller, Get } from '@nestjs/common'; @Controller('users') export class UsersController { @Get() list() {} }\n");

  const first = analyzeTypeScriptTarget(projectPath);
  const second = analyzeTypeScriptTarget(projectPath);
  const persistence = first.responsibilities.findings.filter((finding) => finding.responsibility === 'persistence-interaction');

  assert.deepEqual(first, second);
  assert.deepEqual(first.analysis, analyzeProject(projectPath));
  assert.deepEqual(persistence.map((finding) => `${finding.subject.fileId}:${finding.subject.kind === 'file' ? '' : finding.subject.name}`).sort(), ['src/orders.service.ts:create', 'src/users.service.ts:list']);
  assert.equal(persistence.every((finding) => finding.confidence === 'exact'), true);
  assert.equal(persistence.every((finding) => finding.evidence.some((evidence) => evidence.signal.includes('PrismaClient')) && finding.evidence.some((evidence) => evidence.kind === 'call')), true);
  assert.equal(first.responsibilities.findings.some((finding) => finding.responsibility === 'http-entry-point' && finding.subject.fileId === 'src/users.controller.ts'), true);
});

test('does not infer cross-file Prisma bindings without a resolved direct PrismaClient subclass', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-prisma-cross-file-negative-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/prisma.service.ts'), "import { PrismaClient } from '@prisma/client'; export class PrismaService extends PrismaClient {}\n");
  writeFileSync(path.join(projectPath, 'src/not-prisma.service.ts'), 'export class PrismaService {}\n');
  writeFileSync(path.join(projectPath, 'src/other-prisma.service.ts'), "import { PrismaClient } from 'other-package'; export class PrismaService extends PrismaClient {}\n");
  writeFileSync(path.join(projectPath, 'src/fake.ts'), 'export const db = { user: { findMany() {} } };\n');
  writeFileSync(path.join(projectPath, 'src/consumers.ts'), "import { PrismaService as NotPrisma } from './not-prisma.service'; import { PrismaService as OtherPrisma } from './other-prisma.service'; import { db } from './fake'; import { PrismaService as Missing } from './missing'; import { PrismaService as RealPrisma } from './prisma.service'; class Consumers { constructor(private readonly notPrisma: NotPrisma, private readonly otherPrisma: OtherPrisma, private readonly missing: Missing, private readonly realPrisma: RealPrisma) {} noBase() { return this.notPrisma.user.findMany(); } otherPackage() { return this.otherPrisma.user.findMany(); } unresolved() { return this.missing.user.findMany(); } realWithoutOperation() { return this.realPrisma.user.customThing(); } fakeShape() { return db.user.findMany(); } }\n");

  const result = analyzeTypeScriptTarget(projectPath).responsibilities;
  const execution = result.detectorExecutions.find((item) => item.detector.id === 'prisma.persistence');

  assert.deepEqual(result.findings.filter((finding) => finding.responsibility === 'persistence-interaction'), []);
  assert.equal(execution?.status, 'evaluated');
});

// @ts-expect-error Failed detector outcomes cannot produce factual findings.
const failedWithFinding: ReturnType<ResponsibilityDetector['analyze']> = { status: 'failed', findings: [{}], limitations: [], failure: { code: 'failed', message: 'Failure.' } };
void failedWithFinding;

// @ts-expect-error Partial detector outcomes require a coverage limitation.
const partialWithoutLimitation: ReturnType<ResponsibilityDetector['analyze']> = { status: 'partially-evaluated', findings: [], limitations: [] };
void partialWithoutLimitation;
