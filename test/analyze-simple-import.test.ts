import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';

const fixturePath = path.resolve('fixtures/simple-import');

test('analyze simple-import deterministically', () => {
  const first = analyzeProject(fixturePath);
  const second = analyzeProject(fixturePath);
  const [importEntry] = first.dependencies;

  assert.deepEqual(first, second);
  assert.equal(first.projectPath, '.');
  assert.equal(first.tsconfigPath, 'tsconfig.json');
  assert.equal(first.files.length, 2);
  assert.deepEqual(first.files, [
    { id: 'src/main.ts', path: 'src/main.ts' },
    { id: 'src/service.ts', path: 'src/service.ts' },
  ]);
  assert.equal(first.dependencies.length, 1);
  assert.ok(importEntry);
  assert.deepEqual(importEntry.sourceFileId, 'src/main.ts');
  assert.deepEqual(importEntry.moduleSpecifier, './service');
  assert.deepEqual(importEntry.targetFileId, 'src/service.ts');
  assert.equal(importEntry.kind, 'internal');
  assert.equal(importEntry.confidence, 'exact');
  assert.deepEqual(importEntry.evidence.location.filePath, 'src/main.ts');
  assert.equal(importEntry.evidence.location.line > 0, true);
  assert.equal(importEntry.evidence.location.column > 0, true);
  assert.deepEqual(first.unresolvedDependencies, []);
  assert.deepEqual(first.diagnostics, []);
});

test('distinguishes external and unresolved dependencies', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-contract-'));

  context.after(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(
    path.join(projectPath, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  writeFileSync(
    path.join(projectPath, 'src/main.ts'),
    [
      "import { externalValue } from 'external-package';",
      "import { missingValue } from './missing';",
      '',
      'export const value = externalValue ?? missingValue;',
      '',
    ].join('\n'),
  );

  const result = analyzeProject(projectPath);

  assert.deepEqual(result.files, [{ id: 'src/main.ts', path: 'src/main.ts' }]);
  assert.deepEqual(result.dependencies, [
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: 'external-package',
      kind: 'external',
      evidence: {
        location: {
          filePath: 'src/main.ts',
          line: 1,
          column: 31,
        },
      },
      confidence: 'inferred',
    },
  ]);
  assert.deepEqual(result.unresolvedDependencies, [
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: './missing',
      reason: 'relative-target-not-found',
      evidence: {
        location: {
          filePath: 'src/main.ts',
          line: 2,
          column: 30,
        },
      },
      confidence: 'exact',
    },
  ]);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, 'unresolved-dependency');
  assert.equal(result.diagnostics[0]?.severity, 'warning');
});
