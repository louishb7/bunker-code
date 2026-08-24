import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';
import {
  aggregatePackageDependencies,
  buildProjectGraph,
  buildProjectStructure,
  getFilesInWorkspacePackage,
} from '../packages/graph-engine/src/index.js';
import { createExplorerElements, layoutExplorerElements } from '../apps/explorer-web/src/explorer-model.js';
import { createExplorerProjection, type ExplorerSource } from '../apps/explorer-web/src/explorer-projection.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import {
  createFileOverviewExplorerState,
  createInitialExplorerState,
  openSelectedWorkspacePackage,
  returnToSystem,
  selectWorkspacePackage,
} from '../apps/explorer-web/src/explorer-state.js';
import { searchExplorerFiles } from '../apps/explorer-web/src/explorer-search.js';

const fileDatasetPath = path.resolve('packages/analyzer-typescript');
const workspaceDatasetPath = path.resolve('.');
const workspacePackageId = 'workspace-package:packages/analyzer-typescript';
const contractsPackageId = 'workspace-package:packages/contracts';

function createFileSource(): ExplorerSource {
  const analysis = analyzeProject(fileDatasetPath);
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  return { graph, structure, packageDependencies: aggregatePackageDependencies(graph, structure) };
}

function createWorkspaceSource(): ExplorerSource {
  const analysis = analyzeProject(workspaceDatasetPath);
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  return { graph, structure, packageDependencies: aggregatePackageDependencies(graph, structure) };
}

test('system projection renders every detected workspace package and uses only aggregated package dependencies', () => {
  const source = createWorkspaceSource();
  const projection = createExplorerProjection(source, { scope: 'system', selectedPackageId: null });

  assert.equal(projection.mode, 'system');
  assert.deepEqual(projection.nodes.map((node) => node.id), source.structure.packages.map((workspacePackage) => workspacePackage.id));
  assert.equal(projection.nodes.every((node) => node.kind === 'workspace-package'), true);
  assert.equal(projection.nodes.some((node) => node.id === contractsPackageId), true);
  assert.equal(projection.nodes.every((node) => node.kind !== 'external'), true);
  assert.deepEqual(projection.edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  })), source.packageDependencies.map((dependency) => ({
    source: dependency.sourcePackageId,
    target: dependency.targetPackageId,
  })));
  assert.deepEqual(
    projection.nodes.filter((node) => node.kind === 'workspace-package' && node.filesystemGroup).map((node) => node.filesystemGroup),
    ['apps', 'apps', 'packages', 'packages', 'packages'],
  );
});

test('system projection does not recreate package edges from file graph or manifests', () => {
  const source = createWorkspaceSource();
  const projection = createExplorerProjection({ ...source, packageDependencies: [] }, {
    scope: 'system',
    selectedPackageId: null,
  });

  assert.equal(source.graph.edges.some((edge) => edge.sourceNodeId.includes('analyzer-typescript') && edge.targetNodeId.includes('contracts')), true);
  assert.deepEqual(projection.edges, []);
});

test('isolated detected packages remain visible in the system projection', () => {
  const analysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const source: ExplorerSource = { graph, structure, packageDependencies: aggregatePackageDependencies(graph, structure) };
  const projection = createExplorerProjection(source, { scope: 'system', selectedPackageId: null });

  assert.equal(projection.nodes.some((node) => node.id === 'workspace-package:packages/isolated'), true);
  assert.equal(projection.edges.some((edge) => edge.sourceNodeId === 'workspace-package:packages/isolated' || edge.targetNodeId === 'workspace-package:packages/isolated'), false);
});

test('detected packages without names or analyzed files remain safe to project and open', async () => {
  const analysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const source: ExplorerSource = { graph, structure, packageDependencies: aggregatePackageDependencies(graph, structure) };
  const libraryPackageId = 'workspace-package:packages/library';
  const emptyPackageId = 'workspace-package:packages/empty';
  const systemProjection = createExplorerProjection(source, { scope: 'system', selectedPackageId: null });
  const emptyProjection = createExplorerProjection(source, {
    scope: 'workspace-package',
    packageId: emptyPackageId,
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set(),
  });
  const elements = createExplorerElements(systemProjection);
  const laidOutEmptyElements = await layoutExplorerElements(createExplorerElements(emptyProjection));

  const libraryNode = elements.nodes.find((node) => node.id === libraryPackageId);
  const emptyNode = systemProjection.nodes.find((node) => node.id === emptyPackageId);
  assert.equal(libraryNode?.data.label, 'library');
  assert.equal(emptyNode?.kind, 'workspace-package');
  assert.equal(emptyNode?.kind === 'workspace-package' ? emptyNode.fileCount : undefined, 0);
  assert.deepEqual(emptyProjection.nodes, []);
  assert.deepEqual(emptyProjection.edges, []);
  assert.deepEqual(laidOutEmptyElements.nodes, []);
});

test('package selection remains in system scope and opening it creates an isolated package scope', () => {
  const source = createWorkspaceSource();
  const initial = createInitialExplorerState(source.structure);

  assert.equal(initial.scope, 'system');
  if (initial.scope !== 'system') return;

  const selected = selectWorkspacePackage(initial, workspacePackageId);
  const opened = openSelectedWorkspacePackage(selected);

  assert.equal(selected.scope, 'system');
  assert.equal(selected.selectedPackageId, workspacePackageId);
  assert.deepEqual(selectWorkspacePackage(selected, null), { scope: 'system', selectedPackageId: null });
  assert.deepEqual(opened, {
    scope: 'workspace-package',
    packageId: workspacePackageId,
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set(),
  });
  assert.equal(openSelectedWorkspacePackage({ scope: 'system', selectedPackageId: null }), null);
});

test('package scope keeps owned files internal and cross-package files contextual', () => {
  const source = createWorkspaceSource();
  const projection = createExplorerProjection(source, {
    scope: 'workspace-package',
    packageId: workspacePackageId,
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set(),
  });
  const ownedFileIds = new Set(getFilesInWorkspacePackage(source.structure, workspacePackageId));
  const contextualContractsFile = 'packages/contracts/src/index.ts';

  assert.equal(projection.mode, 'overview');
  assert.equal(projection.nodes.filter((node) => node.kind === 'file' && !node.contextualWorkspacePackage).every((node) => ownedFileIds.has(node.id)), true);
  const contextualFile = projection.nodes.find((node) => node.id === contextualContractsFile);
  assert.equal(contextualFile?.kind, 'file');
  assert.equal(contextualFile?.kind === 'file' ? contextualFile.contextualWorkspacePackage?.id : undefined, contractsPackageId);
  assert.equal(projection.nodes.some((node) => node.kind === 'external'), false);
});

test('file focus, expansion, and search retain their existing file-level behavior', () => {
  const source = createFileSource();
  const focusedFileId = 'src/analysis-result.ts';
  const expandedFileId = 'src/analyze-project.ts';
  const focused = createExplorerProjection(source, {
    scope: 'file-overview',
    selectedNodeId: focusedFileId,
    focusedNodeId: focusedFileId,
    expandedNodeIds: new Set(),
  });
  const expanded = createExplorerProjection(source, {
    scope: 'file-overview',
    selectedNodeId: expandedFileId,
    focusedNodeId: focusedFileId,
    expandedNodeIds: new Set([expandedFileId]),
  });

  assert.equal(focused.mode, 'focus');
  assert.equal(focused.nodes.some((node) => node.id === 'external:@bunker-code/contracts'), true);
  assert.equal(expanded.nodes.some((node) => node.id === 'external:node:fs'), true);
  assert.deepEqual(searchExplorerFiles(source.graph, 'analysis-result.ts'), [{
    nodeId: focusedFileId,
    fileName: 'analysis-result.ts',
    path: focusedFileId,
  }]);
});

test('returning from package scope restores the system projection and preserves package context', () => {
  const source = createWorkspaceSource();
  const state = {
    scope: 'workspace-package' as const,
    packageId: workspacePackageId,
    selectedNodeId: 'packages/analyzer-typescript/src/analyze-project.ts',
    focusedNodeId: null,
    expandedNodeIds: new Set<string>(),
  };
  const returned = returnToSystem(state);
  const projection = createExplorerProjection(source, returned);

  assert.deepEqual(returned, { scope: 'system', selectedPackageId: workspacePackageId });
  assert.equal(projection.mode, 'system');
  assert.equal(projection.nodes.some((node) => node.id === workspacePackageId), true);
});

test('snapshots without workspace structure preserve the file-level overview fallback', () => {
  const source = createFileSource();
  const runtime = createExplorerRuntime(analyzeProject(fileDatasetPath));
  const initial = createInitialExplorerState(source.structure);
  const projection = createExplorerProjection(source, initial);

  assert.equal(runtime.kind, 'ready');
  assert.equal(initial.scope, 'file-overview');
  assert.equal(projection.mode, 'overview');
  assert.equal(projection.nodes.every((node) => node.kind === 'file'), true);
});

test('workspace runtime consumes supplied package dependencies without rebuilding them in the Web layer', () => {
  const analysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const packageDependencies = aggregatePackageDependencies(graph, structure);
  const runtime = createExplorerRuntime({ analysis, packageDependencies });

  assert.equal(runtime.kind, 'ready');
  if (runtime.kind !== 'ready') return;
  assert.deepEqual(runtime.packageDependencies, packageDependencies);
});

test('an invalid package scope fails explicitly instead of producing a corrupt file projection', () => {
  const source = createWorkspaceSource();

  assert.throws(() => createExplorerProjection(source, {
    scope: 'workspace-package',
    packageId: 'workspace-package:packages/stale',
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set(),
  }), /Workspace package not found/);
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

test('web adapter preserves package direction and keeps renderer state out of analytical facts', async () => {
  const source = createWorkspaceSource();
  const projection = createExplorerProjection(source, { scope: 'system', selectedPackageId: null });
  const elements = createExplorerElements(projection);
  const laidOut = await layoutExplorerElements(elements);

  assert.deepEqual(elements.edges.map((edge) => ({ source: edge.source, target: edge.target })), projection.edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  })));
  assert.equal(Object.hasOwn(source.graph, 'selectedNodeId'), false);
  assert.ok(laidOut.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
});

test('search can be restricted to files owned by the current package', () => {
  const source = createWorkspaceSource();
  const ownedFileIds = new Set(getFilesInWorkspacePackage(source.structure, workspacePackageId));

  assert.deepEqual(searchExplorerFiles(source.graph, 'index.ts', ownedFileIds).map((result) => result.nodeId), [
    'packages/analyzer-typescript/src/index.ts',
  ]);
  assert.deepEqual(createFileOverviewExplorerState().expandedNodeIds, new Set());
});
