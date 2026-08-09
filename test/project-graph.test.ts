import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnalysisResult } from '@bunker-code/contracts';
import {
  buildProjectGraph,
  detectCycles,
  getDependencies,
  getDependents,
  getIsolatedFileNodes,
} from '../packages/graph-engine/src/index.js';

const analysis: AnalysisResult = {
  projectPath: '.',
  tsconfigPath: 'tsconfig.json',
  files: [
    { id: 'src/a.ts', path: 'src/a.ts' },
    { id: 'src/b.ts', path: 'src/b.ts' },
    { id: 'src/c.ts', path: 'src/c.ts' },
    { id: 'src/isolated.ts', path: 'src/isolated.ts' },
  ],
  dependencies: [
    {
      sourceFileId: 'src/a.ts',
      targetFileId: 'src/b.ts',
      moduleSpecifier: './b',
      kind: 'internal',
      evidence: { location: { filePath: 'src/a.ts', line: 1, column: 20 } },
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/b.ts',
      targetFileId: 'src/c.ts',
      moduleSpecifier: './c',
      kind: 'internal',
      evidence: { location: { filePath: 'src/b.ts', line: 1, column: 20 } },
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/c.ts',
      targetFileId: 'src/a.ts',
      moduleSpecifier: './a',
      kind: 'internal',
      evidence: { location: { filePath: 'src/c.ts', line: 1, column: 20 } },
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/a.ts',
      moduleSpecifier: 'external-package',
      kind: 'external',
      evidence: { location: { filePath: 'src/a.ts', line: 2, column: 20 } },
      confidence: 'inferred',
    },
  ],
  unresolvedDependencies: [
    {
      sourceFileId: 'src/b.ts',
      moduleSpecifier: './missing',
      reason: 'relative-target-not-found',
      evidence: { location: { filePath: 'src/b.ts', line: 2, column: 20 } },
      confidence: 'exact',
    },
  ],
  diagnostics: [],
};

test('builds a deterministic project graph from analysis result', () => {
  const first = buildProjectGraph(analysis);
  const second = buildProjectGraph(analysis);

  assert.deepEqual(first, second);
  assert.deepEqual(first.nodes, [
    { id: 'external:external-package', kind: 'external', moduleSpecifier: 'external-package' },
    { id: 'src/a.ts', kind: 'file', path: 'src/a.ts' },
    { id: 'src/b.ts', kind: 'file', path: 'src/b.ts' },
    { id: 'src/c.ts', kind: 'file', path: 'src/c.ts' },
    { id: 'src/isolated.ts', kind: 'file', path: 'src/isolated.ts' },
  ]);
  assert.deepEqual(first.edges.map(({ sourceNodeId, targetNodeId, moduleSpecifier, dependencyKind, confidence }) => ({
    sourceNodeId,
    targetNodeId,
    moduleSpecifier,
    dependencyKind,
    confidence,
  })), [
    {
      sourceNodeId: 'src/a.ts',
      targetNodeId: 'src/b.ts',
      moduleSpecifier: './b',
      dependencyKind: 'internal',
      confidence: 'exact',
    },
    {
      sourceNodeId: 'src/a.ts',
      targetNodeId: 'external:external-package',
      moduleSpecifier: 'external-package',
      dependencyKind: 'external',
      confidence: 'inferred',
    },
    {
      sourceNodeId: 'src/b.ts',
      targetNodeId: 'src/c.ts',
      moduleSpecifier: './c',
      dependencyKind: 'internal',
      confidence: 'exact',
    },
    {
      sourceNodeId: 'src/c.ts',
      targetNodeId: 'src/a.ts',
      moduleSpecifier: './a',
      dependencyKind: 'internal',
      confidence: 'exact',
    },
  ]);
  assert.deepEqual(first.unresolvedDependencies, [
    {
      id: 'src/b.ts ? ./missing ? 2:20',
      sourceNodeId: 'src/b.ts',
      moduleSpecifier: './missing',
      reason: 'relative-target-not-found',
      evidence: { location: { filePath: 'src/b.ts', line: 2, column: 20 } },
      confidence: 'exact',
    },
  ]);
});

test('queries dependencies, dependents, isolated files and cycles', () => {
  const graph = buildProjectGraph(analysis);

  assert.deepEqual(
    getDependencies(graph, 'src/a.ts').map((edge) => edge.targetNodeId),
    ['src/b.ts', 'external:external-package'],
  );
  assert.deepEqual(
    getDependents(graph, 'src/a.ts').map((edge) => edge.sourceNodeId),
    ['src/c.ts'],
  );
  assert.deepEqual(getIsolatedFileNodes(graph), [
    { id: 'src/isolated.ts', kind: 'file', path: 'src/isolated.ts' },
  ]);
  assert.deepEqual(detectCycles(graph), [
    { nodeIds: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts'] },
  ]);
});
