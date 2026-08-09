import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';

const fixturePath = path.resolve('fixtures/simple-import');

function createTempProject(context: { after: (callback: () => void) => void }): string {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-analyzer-'));

  context.after(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  return projectPath;
}

function writeProjectFile(projectPath: string, filePath: string, content: string): void {
  const absolutePath = path.join(projectPath, filePath);

  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function dependencySummary(result: ReturnType<typeof analyzeProject>) {
  return result.dependencies.map(({ sourceFileId, targetFileId, moduleSpecifier, kind, confidence }) => {
    const summary = {
      sourceFileId,
      moduleSpecifier,
      kind,
      confidence,
    };

    return targetFileId ? { ...summary, targetFileId } : summary;
  });
}

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
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
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
  writeProjectFile(
    projectPath,
    'src/main.ts',
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

test('resolves realistic TypeScript module patterns deterministically', (context) => {
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        baseUrl: 'src',
        paths: {
          '@core/*': ['core/*'],
        },
        strict: true,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/excluded.ts'],
    }),
  );
  writeProjectFile(
    projectPath,
    'src/main.ts',
    [
      "import { helper } from './utils/helper';",
      "import { nested } from './nested/nested';",
      "import { core } from '@core/core';",
      "import { feature } from 'feature/index';",
      "import { barrel } from './barrel';",
      "import type { TypeOnly } from './types';",
      "import 'external-package';",
      "import './missing';",
      '',
      'export const value: TypeOnly = `${helper()}${nested()}${core()}${feature()}${barrel}`;',
      '',
    ].join('\n'),
  );
  writeProjectFile(projectPath, 'src/utils/helper.ts', "export function helper(): string { return 'helper'; }\n");
  writeProjectFile(projectPath, 'src/nested/nested.ts', "export function nested(): string { return 'nested'; }\n");
  writeProjectFile(projectPath, 'src/core/core.ts', "export function core(): string { return 'core'; }\n");
  writeProjectFile(projectPath, 'src/feature/index.ts', "export { feature } from './feature-service';\n");
  writeProjectFile(projectPath, 'src/feature/feature-service.ts', "export function feature(): string { return 'feature'; }\n");
  writeProjectFile(projectPath, 'src/barrel/index.ts', "export * from './target';\n");
  writeProjectFile(projectPath, 'src/barrel/target.ts', "export const barrel = 'barrel';\n");
  writeProjectFile(projectPath, 'src/reexport.ts', "export { nested } from './nested/nested';\n");
  writeProjectFile(projectPath, 'src/types.ts', 'export interface TypeOnly { toString(): string; }\n');
  writeProjectFile(projectPath, 'src/excluded.ts', "import './not-analyzed';\n");

  const first = analyzeProject(projectPath);
  const second = analyzeProject(projectPath);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.files.map((file) => file.path),
    [
      'src/barrel/index.ts',
      'src/barrel/target.ts',
      'src/core/core.ts',
      'src/feature/feature-service.ts',
      'src/feature/index.ts',
      'src/main.ts',
      'src/nested/nested.ts',
      'src/reexport.ts',
      'src/types.ts',
      'src/utils/helper.ts',
    ],
  );
  assert.deepEqual(dependencySummary(first), [
    {
      sourceFileId: 'src/barrel/index.ts',
      targetFileId: 'src/barrel/target.ts',
      moduleSpecifier: './target',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/feature/index.ts',
      targetFileId: 'src/feature/feature-service.ts',
      moduleSpecifier: './feature-service',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/barrel/index.ts',
      moduleSpecifier: './barrel',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/nested/nested.ts',
      moduleSpecifier: './nested/nested',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/types.ts',
      moduleSpecifier: './types',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/utils/helper.ts',
      moduleSpecifier: './utils/helper',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/core/core.ts',
      moduleSpecifier: '@core/core',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: 'external-package',
      kind: 'external',
      confidence: 'inferred',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/feature/index.ts',
      moduleSpecifier: 'feature/index',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/reexport.ts',
      targetFileId: 'src/nested/nested.ts',
      moduleSpecifier: './nested/nested',
      kind: 'internal',
      confidence: 'exact',
    },
  ]);
  assert.deepEqual(first.unresolvedDependencies.map(({ sourceFileId, moduleSpecifier, reason, confidence }) => ({
    sourceFileId,
    moduleSpecifier,
    reason,
    confidence,
  })), [
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: './missing',
      reason: 'relative-target-not-found',
      confidence: 'exact',
    },
  ]);
  assert.equal(first.diagnostics.length, 1);
  assert.equal(first.diagnostics[0]?.code, 'unresolved-dependency');
  assert.equal(first.dependencies.every((dependency) => dependency.evidence.location.filePath.includes('\\') === false), true);
  assert.equal(first.unresolvedDependencies.every((dependency) => dependency.evidence.location.filePath.includes('\\') === false), true);
});

test('reports invalid project inputs explicitly', (context) => {
  const missingProjectPath = path.join(os.tmpdir(), 'bunkercode-missing-project');
  const withoutTsconfigPath = createTempProject(context);
  const invalidTsconfigPath = createTempProject(context);

  writeProjectFile(invalidTsconfigPath, 'tsconfig.json', '{ invalid json');

  assert.throws(
    () => analyzeProject(missingProjectPath),
    /Project directory not found:/,
  );
  assert.throws(
    () => analyzeProject(withoutTsconfigPath),
    /tsconfig\.json not found:/,
  );
  assert.throws(
    () => analyzeProject(invalidTsconfigPath),
    /Invalid TypeScript project configuration:/,
  );
});
