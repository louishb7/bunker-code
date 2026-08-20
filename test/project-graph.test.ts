import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnalysisResult } from '@bunker-code/contracts';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';
import {
  aggregatePackageDependencies,
  buildProjectGraph,
  buildProjectStructure,
  createImpactReport,
  createProjectDiagnostics,
  detectCycles,
  getDependencies,
  getDependents,
  getFilesInWorkspacePackage,
  getIsolatedFileNodes,
  getWorkspacePackageForFile,
  getTransitiveDependents,
} from '../packages/graph-engine/src/index.js';
import path from 'node:path';
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

test('detects PNPM workspace containment and aggregates evidence-backed package dependencies', () => {
  const workspacePath = path.resolve('fixtures/pnpm-workspace-structure');
  const first = analyzeProject(workspacePath);
  const second = analyzeProject(workspacePath);
  const graph = buildProjectGraph(first);
  const structure = buildProjectStructure(first);
  const applicationPackageId = 'workspace-package:apps/application';
  const libraryPackageId = 'workspace-package:packages/library';

  assert.deepEqual(first, second);
  assert.equal(first.tsconfigPath, 'pnpm-workspace.yaml');
  assert.deepEqual(structure.packages.map(({ id, rootPath, name }) => ({ id, rootPath, name })), [
    { id: applicationPackageId, rootPath: 'apps/application', name: '@fixture/application' },
    { id: 'workspace-package:packages/isolated', rootPath: 'packages/isolated', name: '@fixture/isolated' },
    { id: libraryPackageId, rootPath: 'packages/library', name: undefined },
  ]);
  assert.deepEqual(structure.packages[0]?.evidence, [
    { kind: 'workspace-configuration', path: 'pnpm-workspace.yaml' },
    { kind: 'workspace-pattern', pattern: 'apps/*' },
    { kind: 'package-manifest', path: 'apps/application/package.json' },
  ]);
  assert.equal(structure.packages.some((workspacePackage) => workspacePackage.rootPath === 'packages/excluded-package'), false);
  assert.equal(structure.packages.some((workspacePackage) => workspacePackage.rootPath === 'packages/no-manifest'), false);
  assert.equal(getWorkspacePackageForFile(structure, 'apps/application/src/main.ts')?.id, applicationPackageId);
  assert.equal(getWorkspacePackageForFile(structure, 'orphan.ts'), undefined);
  assert.deepEqual(getFilesInWorkspacePackage(structure, libraryPackageId), [
    'packages/library/src/first.ts',
    'packages/library/src/second.ts',
  ]);
  assert.deepEqual(structure.unassignedFileIds, ['orphan.ts']);
  assert.deepEqual(aggregatePackageDependencies(graph, structure).map((dependency) => ({
    sourcePackageId: dependency.sourcePackageId,
    targetPackageId: dependency.targetPackageId,
    fileDependencyIds: dependency.fileDependencies.map((edge) => edge.id),
  })), [{
    sourcePackageId: applicationPackageId,
    targetPackageId: libraryPackageId,
    fileDependencyIds: [
      'apps/application/src/main.ts -> packages/library/src/first.ts -> ../../../packages/library/src/first.js -> 1:23',
      'apps/application/src/main.ts -> packages/library/src/second.ts -> ../../../packages/library/src/second.js -> 2:24',
    ],
  }]);
  assert.equal(aggregatePackageDependencies(graph, structure).some((dependency) => dependency.targetPackageId.includes('external')), false);
});

test('represents projects without a PNPM workspace as structure with unassigned files', () => {
  const structure = buildProjectStructure(analysis);

  assert.deepEqual(structure.packages, []);
  assert.deepEqual(structure.fileMemberships, []);
  assert.deepEqual(structure.unassignedFileIds, [
    'src/a.ts',
    'src/b.ts',
    'src/c.ts',
    'src/isolated.ts',
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

test('finds deterministic transitive dependents with depth and shortest paths', () => {
  const graph = graphFromEdges(
    ['src/target.ts', 'src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/isolated.ts'],
    [
      ['src/a.ts', 'src/target.ts'],
      ['src/b.ts', 'src/target.ts'],
      ['src/c.ts', 'src/a.ts'],
      ['src/c.ts', 'src/b.ts'],
      ['src/d.ts', 'src/c.ts'],
    ],
  );

  const first = getTransitiveDependents(graph, 'src/target.ts');
  const second = getTransitiveDependents(graph, 'src/target.ts');

  assert.deepEqual(first, second);
  assert.deepEqual(first, [
    {
      node: { id: 'src/a.ts', kind: 'file', path: 'src/a.ts' },
      depth: 1,
      path: ['src/target.ts', 'src/a.ts'],
    },
    {
      node: { id: 'src/b.ts', kind: 'file', path: 'src/b.ts' },
      depth: 1,
      path: ['src/target.ts', 'src/b.ts'],
    },
    {
      node: { id: 'src/c.ts', kind: 'file', path: 'src/c.ts' },
      depth: 2,
      path: ['src/target.ts', 'src/a.ts', 'src/c.ts'],
    },
    {
      node: { id: 'src/d.ts', kind: 'file', path: 'src/d.ts' },
      depth: 3,
      path: ['src/target.ts', 'src/a.ts', 'src/c.ts', 'src/d.ts'],
    },
  ]);
  assert.deepEqual(getTransitiveDependents(graph, 'src/isolated.ts'), []);
});

test('creates an impact report separated from diagnostics with factual circularity evidence', () => {
  const graph = graphFromEdges(
    ['src/target.ts', 'src/a.ts', 'src/b.ts', 'src/c.ts', 'src/outside.ts'],
    [
      ['src/a.ts', 'src/target.ts'],
      ['src/b.ts', 'src/a.ts'],
      ['src/target.ts', 'src/b.ts'],
      ['src/c.ts', 'src/a.ts'],
    ],
  );

  const report = createImpactReport(graph, 'src/target.ts');

  assert.deepEqual(report.target, { id: 'src/target.ts', kind: 'file', path: 'src/target.ts' });
  assert.deepEqual(report.directDependents, [
    { id: 'src/a.ts', kind: 'file', path: 'src/a.ts' },
  ]);
  assert.deepEqual(report.affectedDependents.map((dependent) => ({
    nodeId: dependent.node.id,
    depth: dependent.depth,
    path: dependent.path,
  })), [
    {
      nodeId: 'src/a.ts',
      depth: 1,
      path: ['src/target.ts', 'src/a.ts'],
    },
    {
      nodeId: 'src/b.ts',
      depth: 2,
      path: ['src/target.ts', 'src/a.ts', 'src/b.ts'],
    },
    {
      nodeId: 'src/c.ts',
      depth: 2,
      path: ['src/target.ts', 'src/a.ts', 'src/c.ts'],
    },
  ]);
  assert.equal(report.totalAffected, 3);
  assert.equal(report.maxDepth, 2);
  assert.equal(report.circularity.participatesInCycle, true);
  assert.deepEqual(report.circularity.cycle, {
    nodeIds: ['src/a.ts', 'src/target.ts', 'src/b.ts', 'src/a.ts'],
  });
  assert.equal(report.affectedDependents.some((dependent) => dependent.node.id === 'src/target.ts'), false);
});

test('rejects impact analysis for a missing target file node', () => {
  const graph = graphFromEdges(['src/target.ts'], []);

  assert.throws(
    () => getTransitiveDependents(graph, 'src/missing.ts'),
    /Impact target file not found in project graph: src\/missing\.ts/,
  );
  assert.throws(
    () => createImpactReport(graph, 'src/missing.ts'),
    /Impact target file not found in project graph: src\/missing\.ts/,
  );
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
