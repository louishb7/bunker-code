import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';

const fixturePath = path.resolve('fixtures/simple-import');

test('analyze simple-import deterministically', () => {
  const first = analyzeProject(fixturePath);
  const second = analyzeProject(fixturePath);
  const [importEntry] = first.imports;

  assert.deepEqual(first, second);
  assert.equal(first.projectPath, '.');
  assert.equal(first.tsconfigPath, 'tsconfig.json');
  assert.equal(first.files.length, 2);
  assert.deepEqual(first.files, [{ path: 'src/main.ts' }, { path: 'src/service.ts' }]);
  assert.equal(first.imports.length, 1);
  assert.ok(importEntry);
  assert.deepEqual(importEntry.sourceFile, 'src/main.ts');
  assert.deepEqual(importEntry.moduleSpecifier, './service');
  assert.deepEqual(importEntry.targetFile, 'src/service.ts');
  assert.equal(importEntry.location.line > 0, true);
  assert.equal(importEntry.location.column > 0, true);
  assert.deepEqual(first.unresolvedImports, []);
});
