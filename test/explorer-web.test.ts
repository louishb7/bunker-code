import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';
import { buildProjectGraph } from '../packages/graph-engine/src/index.js';
import {
  createExplorerElements,
  layoutExplorerElements,
  selectedNeighborhood,
} from '../apps/explorer-web/src/explorer-model.js';

const datasetPath = path.resolve('packages/analyzer-typescript');

test('web adapter keeps ProjectGraph identifiers and dependency direction', () => {
  const graph = buildProjectGraph(analyzeProject(datasetPath));
  const elements = createExplorerElements(graph);

  assert.deepEqual(elements.nodes.map((node) => node.id), graph.nodes
    .filter((node) => node.kind === 'file')
    .map((node) => node.id));
  assert.deepEqual(elements.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })), graph.edges
    .filter((edge) => graph.nodes.some((node) => node.kind === 'file' && node.id === edge.sourceNodeId))
    .filter((edge) => graph.nodes.some((node) => node.kind === 'file' && node.id === edge.targetNodeId))
    .map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId })));
});

test('ELK assigns finite positions without changing analytical facts', async () => {
  const graph = buildProjectGraph(analyzeProject(datasetPath));
  const before = structuredClone(graph);
  const elements = createExplorerElements(graph);
  const laidOut = await layoutExplorerElements(elements);

  assert.deepEqual(graph, before);
  assert.equal(Object.hasOwn(graph, 'selectedNode'), false);
  assert.ok(laidOut.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
});

test('selected neighborhood matches direct ProjectGraph relationships', () => {
  const graph = buildProjectGraph(analyzeProject(datasetPath));
  const neighborhood = selectedNeighborhood(graph, 'src/analysis-result.ts');

  assert.equal(neighborhood.targetNodeId, 'src/analysis-result.ts');
  assert.deepEqual([...neighborhood.dependencyNodeIds], []);
  assert.deepEqual([...neighborhood.dependentNodeIds], ['src/analyze-project.ts', 'src/index.ts']);
});
