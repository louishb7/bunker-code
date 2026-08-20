import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';
import { buildProjectGraph } from '../packages/graph-engine/src/index.js';
import { createExplorerElements, layoutExplorerElements } from '../apps/explorer-web/src/explorer-model.js';
import { createExplorerProjection } from '../apps/explorer-web/src/explorer-projection.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import { searchExplorerFiles } from '../apps/explorer-web/src/explorer-search.js';

const datasetPath = path.resolve('packages/analyzer-typescript');

function createGraph() {
  return buildProjectGraph(analyzeProject(datasetPath));
}

test('search finds internal files by file name and path without changing the projection', () => {
  const graph = createGraph();
  const before = structuredClone(graph);
  const projection = createExplorerProjection(graph, {
    selectedNodeId: null,
    focusedNodeId: 'src/analysis-result.ts',
    expandedNodeIds: new Set(),
  });

  assert.deepEqual(searchExplorerFiles(graph, 'analysis-result.ts'), [
    {
      nodeId: 'src/analysis-result.ts',
      fileName: 'analysis-result.ts',
      path: 'src/analysis-result.ts',
    },
  ]);
  assert.deepEqual(searchExplorerFiles(graph, 'src/analyze'), [
    {
      nodeId: 'src/analyze-project.ts',
      fileName: 'analyze-project.ts',
      path: 'src/analyze-project.ts',
    },
  ]);
  assert.deepEqual(graph, before);
  assert.deepEqual(createExplorerProjection(graph, {
    selectedNodeId: null,
    focusedNodeId: 'src/analysis-result.ts',
    expandedNodeIds: new Set(),
  }), projection);
});

test('empty and unmatched searches return no results', () => {
  const graph = createGraph();

  assert.deepEqual(searchExplorerFiles(graph, ''), []);
  assert.deepEqual(searchExplorerFiles(graph, 'missing-file.ts'), []);
});

test('runtime reports invalid and empty snapshots without mutating their inputs', () => {
  const invalidSnapshot = { schemaVersion: 1, files: [] };
  const before = structuredClone(invalidSnapshot);
  const invalidRuntime = createExplorerRuntime(invalidSnapshot);
  const emptyRuntime = createExplorerRuntime({
    schemaVersion: 1,
    analyzer: { name: 'test', language: 'typescript' },
    projectPath: '.',
    tsconfigPath: 'tsconfig.json',
    files: [],
    dependencies: [],
    unresolvedDependencies: [],
    diagnostics: [],
  });

  assert.equal(invalidRuntime.kind, 'invalid-snapshot');
  assert.equal(emptyRuntime.kind, 'empty-graph');
  assert.deepEqual(invalidSnapshot, before);
});

test('overview projects only internal files', () => {
  const projection = createExplorerProjection(createGraph(), {
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set(),
  });

  assert.equal(projection.mode, 'overview');
  assert.deepEqual(projection.nodes.map((node) => node.id), [
    '../contracts/src/index.ts',
    'src/analysis-result.ts',
    'src/analyze-project.ts',
    'src/index.ts',
  ]);
  assert.equal(projection.nodes.every((node) => node.kind === 'file'), true);
  assert.equal(projection.edges.every((edge) => edge.dependencyKind === 'internal'), true);
});

test('focus projects the target, direct context, and contextual external nodes', () => {
  const graph = createGraph();
  const projection = createExplorerProjection(graph, {
    selectedNodeId: 'src/analysis-result.ts',
    focusedNodeId: 'src/analysis-result.ts',
    expandedNodeIds: new Set(),
  });

  assert.equal(projection.mode, 'focus');
  assert.deepEqual(projection.nodes.map((node) => node.id), [
    'external:@bunker-code/contracts',
    'src/analysis-result.ts',
    'src/analyze-project.ts',
    'src/index.ts',
  ]);
  assert.equal(projection.edges.every((edge) => (
    projection.visibleNodeIds.has(edge.sourceNodeId) && projection.visibleNodeIds.has(edge.targetNodeId)
  )), true);
  assert.equal(projection.nodes.some((node) => node.id === 'external:node:fs'), false);
});

test('expansion adds direct context without mutating ProjectGraph', () => {
  const graph = createGraph();
  const before = structuredClone(graph);
  const projection = createExplorerProjection(graph, {
    selectedNodeId: 'src/analyze-project.ts',
    focusedNodeId: 'src/analysis-result.ts',
    expandedNodeIds: new Set(['src/analyze-project.ts']),
  });

  assert.deepEqual(graph, before);
  assert.deepEqual(projection.nodes.map((node) => node.id), [
    'external:@bunker-code/contracts',
    'external:node:fs',
    'external:node:path',
    'external:ts-morph',
    'src/analysis-result.ts',
    'src/analyze-project.ts',
    'src/index.ts',
  ]);
  assert.equal(projection.nodes.filter((node) => node.kind === 'external').length, 4);
});

test('multiple explicit expansions produce a deterministic union', () => {
  const graph = createGraph();
  const first = createExplorerProjection(graph, {
    selectedNodeId: null,
    focusedNodeId: 'src/analyze-project.ts',
    expandedNodeIds: new Set(['src/analysis-result.ts', 'src/index.ts']),
  });
  const second = createExplorerProjection(graph, {
    selectedNodeId: null,
    focusedNodeId: 'src/analyze-project.ts',
    expandedNodeIds: new Set(['src/index.ts', 'src/analysis-result.ts']),
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.nodes.map((node) => node.id), [
    'external:@bunker-code/contracts',
    'external:node:fs',
    'external:node:path',
    'external:ts-morph',
    'src/analysis-result.ts',
    'src/analyze-project.ts',
    'src/index.ts',
  ]);
});

test('web adapter preserves projected identifiers, edge direction, and visual-state boundary', async () => {
  const graph = createGraph();
  const before = structuredClone(graph);
  const projection = createExplorerProjection(graph, {
    selectedNodeId: 'src/analysis-result.ts',
    focusedNodeId: 'src/analysis-result.ts',
    expandedNodeIds: new Set(['src/analyze-project.ts']),
  });
  const elements = createExplorerElements(projection);
  const laidOut = await layoutExplorerElements(elements);

  assert.deepEqual(graph, before);
  assert.equal(Object.hasOwn(graph, 'selectedNodeId'), false);
  assert.equal(Object.hasOwn(graph, 'focusedNodeId'), false);
  assert.equal(Object.hasOwn(graph, 'expandedNodeIds'), false);
  assert.deepEqual(elements.nodes.map((node) => node.id), projection.nodes.map((node) => node.id));
  assert.deepEqual(elements.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })), projection.edges
    .map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId })));
  assert.ok(laidOut.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
});
