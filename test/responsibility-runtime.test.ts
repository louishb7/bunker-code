import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { ResponsibilityDetector } from '../packages/analyzer-typescript/src/responsibility-detectors/detector.js';
import { analyzeResponsibilitiesWithSession } from '../packages/analyzer-typescript/src/responsibility-detectors/runtime.js';
import { createTypeScriptAnalysisSession } from '../packages/analyzer-typescript/src/typescript-analysis-session.js';
import { analyzeProject, analyzeTypeScriptTarget } from '../packages/analyzer-typescript/src/index.js';

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
  assert.equal(first.responsibilities.findings.find((finding) => finding.responsibility === 'http-entry-point')?.evidence[0]?.technology.id, 'nestjs');
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
  const result = analyzeTypeScriptTarget(projectPath).responsibilities;
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

// @ts-expect-error Failed detector outcomes cannot produce factual findings.
const failedWithFinding: ReturnType<ResponsibilityDetector['analyze']> = { status: 'failed', findings: [{}], limitations: [], failure: { code: 'failed', message: 'Failure.' } };
void failedWithFinding;

// @ts-expect-error Partial detector outcomes require a coverage limitation.
const partialWithoutLimitation: ReturnType<ResponsibilityDetector['analyze']> = { status: 'partially-evaluated', findings: [], limitations: [] };
void partialWithoutLimitation;
