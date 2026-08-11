import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnalysisResult } from '@bunker-code/contracts';
import {
  buildProjectGraph,
  createProjectDiagnostics,
  detectCycles,
  getDependencies,
  getDependents,
  getIsolatedFileNodes,
} from '../packages/graph-engine/src/index.js';
import type { ProjectGraph, ProjectGraphEdge } from '../packages/graph-engine/src/index.js';

const analysis: AnalysisResult = {
  schemaVersion: 1,
  analyzer: {
    name: '@bunker-code/analyzer-typescript',
    language: 'typescript',
  },
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
  const serializedBeforeQueries = JSON.stringify(graph);

  assert.deepEqual(
    getDependencies(graph, 'src/a.ts').map((edge) => edge.targetNodeId),
    ['src/b.ts', 'external:external-package'],
  );
  assert.deepEqual(
    getDependencies(graph, 'src/a.ts').map((edge) => edge.targetNodeId),
    ['src/b.ts', 'external:external-package'],
  );
  assert.deepEqual(
    getDependents(graph, 'src/a.ts').map((edge) => edge.sourceNodeId),
    ['src/c.ts'],
  );
  assert.deepEqual(getDependencies(graph, 'src/isolated.ts'), []);
  assert.deepEqual(getDependents(graph, 'src/isolated.ts'), []);
  assert.deepEqual(getIsolatedFileNodes(graph), [
    { id: 'src/isolated.ts', kind: 'file', path: 'src/isolated.ts' },
  ]);
  assert.deepEqual(detectCycles(graph), [
    { nodeIds: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts'] },
  ]);
  assert.equal(JSON.stringify(graph), serializedBeforeQueries);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(graph))), [
    'nodes',
    'edges',
    'unresolvedDependencies',
  ]);
});

test('creates evidence-backed project diagnostics from graph queries', () => {
  const graph = buildProjectGraph(analysis);
  const report = createProjectDiagnostics(graph, {
    thresholds: {
      manyDependents: 1,
      manyDependencies: 2,
    },
  });

  assert.deepEqual(report.thresholds, {
    manyDependents: 1,
    manyDependencies: 2,
  });

  const circularDependency = report.diagnostics.find((diagnostic) => diagnostic.kind === 'circular-dependency');
  const unresolvedDependency = report.diagnostics.find((diagnostic) => diagnostic.kind === 'unresolved-dependency');
  const manyDependents = report.diagnostics.find((diagnostic) => diagnostic.id === 'many-dependents:src/a.ts');
  const manyDependencies = report.diagnostics.find((diagnostic) => diagnostic.kind === 'many-dependencies');
  const isolatedFile = report.diagnostics.find((diagnostic) => diagnostic.kind === 'isolated-file');
  const fanOut = report.diagnostics.find((diagnostic) => diagnostic.id === 'fan-out:src/a.ts');

  assert.ok(circularDependency);
  assert.equal(circularDependency.basis, 'fact');
  assert.equal(circularDependency.confidence, 'exact');
  assert.deepEqual(circularDependency.subject.nodeIds, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts']);
  assert.deepEqual(circularDependency.evidence.map((evidence) => evidence.kind), ['edge', 'edge', 'edge']);

  assert.ok(unresolvedDependency);
  assert.equal(unresolvedDependency.basis, 'fact');
  assert.equal(unresolvedDependency.confidence, 'exact');
  assert.equal(unresolvedDependency.evidence[0]?.kind, 'unresolved-dependency');

  assert.ok(fanOut);
  assert.equal(fanOut.basis, 'fact');
  assert.equal(fanOut.confidence, 'inferred');
  assert.equal(fanOut.evidence.length, 2);

  assert.ok(manyDependents);
  assert.equal(manyDependents.basis, 'heuristic');
  assert.equal(manyDependents.confidence, 'exact');
  assert.deepEqual(manyDependents.threshold, {
    name: 'manyDependents',
    actual: 1,
    minimum: 1,
  });

  assert.ok(manyDependencies);
  assert.equal(manyDependencies.basis, 'heuristic');
  assert.equal(manyDependencies.confidence, 'inferred');
  assert.deepEqual(manyDependencies.threshold, {
    name: 'manyDependencies',
    actual: 2,
    minimum: 2,
  });

  assert.ok(isolatedFile);
  assert.equal(isolatedFile.confidence, 'exact');
  assert.deepEqual(isolatedFile.evidence, [
    { kind: 'file-node', node: { id: 'src/isolated.ts', kind: 'file', path: 'src/isolated.ts' } },
  ]);
});

test('detects circular components without enumerating every simple cycle', () => {
  assert.deepEqual(detectCycles(graphFromEdges(['src/a.ts', 'src/b.ts', 'src/c.ts'], [
    ['src/a.ts', 'src/b.ts'],
    ['src/b.ts', 'src/c.ts'],
  ])), []);
  assert.deepEqual(detectCycles(graphFromEdges(['src/a.ts', 'src/b.ts', 'src/c.ts'], [
    ['src/a.ts', 'src/b.ts'],
    ['src/b.ts', 'src/c.ts'],
    ['src/c.ts', 'src/a.ts'],
  ])), [
    { nodeIds: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts'] },
  ]);
  assert.deepEqual(detectCycles(graphFromEdges(['src/a.ts'], [
    ['src/a.ts', 'src/a.ts'],
  ])), [
    { nodeIds: ['src/a.ts', 'src/a.ts'] },
  ]);
  assert.deepEqual(detectCycles(graphFromEdges(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], [
    ['src/a.ts', 'src/b.ts'],
    ['src/b.ts', 'src/a.ts'],
    ['src/c.ts', 'src/d.ts'],
    ['src/d.ts', 'src/c.ts'],
  ])), [
    { nodeIds: ['src/a.ts', 'src/b.ts', 'src/a.ts'] },
    { nodeIds: ['src/c.ts', 'src/d.ts', 'src/c.ts'] },
  ]);
  assert.deepEqual(detectCycles(graphFromEdges(['src/a.ts', 'src/b.ts', 'src/c.ts'], [
    ['src/a.ts', 'src/b.ts'],
    ['src/a.ts', 'src/c.ts'],
    ['src/b.ts', 'src/a.ts'],
    ['src/b.ts', 'src/c.ts'],
    ['src/c.ts', 'src/a.ts'],
    ['src/c.ts', 'src/b.ts'],
  ])), [
    { nodeIds: ['src/a.ts', 'src/b.ts', 'src/a.ts'] },
  ]);
});

function graphFromEdges(fileNodeIds: string[], edgeNodeIds: Array<[string, string]>): ProjectGraph {
  return {
    nodes: fileNodeIds.map((id) => ({ id, kind: 'file', path: id })),
    edges: edgeNodeIds.map(([sourceNodeId, targetNodeId], index) => graphEdge(sourceNodeId, targetNodeId, index + 1)),
    unresolvedDependencies: [],
  };
}

function graphEdge(sourceNodeId: string, targetNodeId: string, line: number): ProjectGraphEdge {
  return {
    id: `${sourceNodeId} -> ${targetNodeId} -> ./target -> ${line}:1`,
    sourceNodeId,
    targetNodeId,
    kind: 'dependency',
    dependencyKind: 'internal',
    moduleSpecifier: './target',
    evidence: {
      location: {
        filePath: sourceNodeId,
        line,
        column: 1,
      },
    },
    confidence: 'exact',
  };
}
