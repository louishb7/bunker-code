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
import { createExplorerOrientation } from '../apps/explorer-web/src/explorer-orientation.js';
import { createExplorerProjection, type ExplorerSource } from '../apps/explorer-web/src/explorer-projection.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import {
  createFileOverviewExplorerState,
  createInitialExplorerState,
  expandFileNode,
  focusFileNode,
  openSelectedWorkspacePackage,
  returnToFileOverview,
  returnToSystem,
  selectFileNode,
  selectSearchResultFile,
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
  const systemParts = projection.nodes.filter((node) => node.kind === 'workspace-package');
  const analyzedFileCount = source.graph.nodes.filter((node) => node.kind === 'file').length;
  const elements = createExplorerElements(projection);

  assert.equal(projection.mode, 'system');
  assert.equal(projection.systemSummary?.detectedPartCount, source.structure.packages.length);
  assert.equal(projection.systemSummary?.analyzedFileCount, analyzedFileCount);
  assert.deepEqual(projection.nodes.map((node) => node.id), source.structure.packages.map((workspacePackage) => workspacePackage.id));
  assert.equal(projection.nodes.every((node) => node.kind === 'workspace-package'), true);
  assert.equal(projection.nodes.some((node) => node.id === contractsPackageId), true);
  assert.equal(projection.nodes.every((node) => node.kind !== 'external'), true);
  assert.equal(elements.nodes.length, source.structure.packages.length);
  assert.equal(elements.nodes.some((node) => node.data.kind !== 'workspace-package'), false);
  assert.equal(elements.nodes.some((node) => node.id.startsWith('filesystem-group:')), false);
  for (const part of systemParts) {
    assert.equal(part.fileCount, getFilesInWorkspacePackage(source.structure, part.id).length);
    assert.equal(part.usesCount, source.packageDependencies.filter((dependency) => dependency.sourcePackageId === part.id).length);
    assert.equal(part.usedByCount, source.packageDependencies.filter((dependency) => dependency.targetPackageId === part.id).length);
    assert.equal(projection.systemSummary?.filesystemGroups.some((group) => (
      group.id === part.filesystemGroup && group.partLabels.includes(part.presentationLabel)
    )), true);
  }
  const collidingPackages = source.structure.packages.map((workspacePackage, index) => (
    index < 2 ? { ...workspacePackage, name: `@scope-${index + 1}/shared` } : workspacePackage
  ));
  const collisionProjection = createExplorerProjection({
    ...source,
    structure: { ...source.structure, packages: collidingPackages },
  }, { scope: 'system', selectedPackageId: null });
  assert.deepEqual(collisionProjection.nodes.slice(0, 2).map((node) => (
    node.kind === 'workspace-package' ? node.presentationLabel : undefined
  )), ['@scope-1/shared', '@scope-2/shared']);
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
  assert.equal(projection.nodes.every((node) => (
    node.kind === 'workspace-package' && node.usesCount === 0 && node.usedByCount === 0
  )), true);
});

test('isolated detected packages remain visible in the system projection', () => {
  const analysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const source: ExplorerSource = { graph, structure, packageDependencies: aggregatePackageDependencies(graph, structure) };
  const projection = createExplorerProjection(source, { scope: 'system', selectedPackageId: null });
  const isolatedPart = projection.nodes.find((node) => node.id === 'workspace-package:packages/isolated');

  assert.equal(isolatedPart?.kind, 'workspace-package');
  assert.equal(isolatedPart?.kind === 'workspace-package' ? isolatedPart.usesCount : undefined, 0);
  assert.equal(isolatedPart?.kind === 'workspace-package' ? isolatedPart.usedByCount : undefined, 0);
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
  assert.deepEqual(systemProjection.systemSummary?.filesystemGroups.map((group) => group.label), ['apps/', 'packages/']);
  assert.equal(libraryNode?.data.label, 'library');
  assert.equal(libraryNode?.data.technicalLabel, 'packages/library');
  assert.equal(libraryNode?.data.subtitle, 'Part of this system');
  assert.equal(emptyNode?.kind, 'workspace-package');
  assert.equal(emptyNode?.kind === 'workspace-package' ? emptyNode.presentationLabel : undefined, 'empty');
  assert.equal(emptyNode?.kind === 'workspace-package' ? emptyNode.fileCount : undefined, 0);
  assert.equal(elements.nodes.find((node) => node.id === emptyPackageId)?.data.fileCount, 0);
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

test('orientation distinguishes inspection, drill-down, focused connections, expansion, and semantic back', () => {
  const source = createWorkspaceSource();
  const focusedFileId = 'packages/analyzer-typescript/src/analyze-project.ts';
  const inspectedContextId = 'packages/contracts/src/index.ts';
  const initial = createInitialExplorerState(source.structure);

  assert.equal(initial.scope, 'system');
  if (initial.scope !== 'system') return;

  const initialOrientation = createExplorerOrientation(initial, 'bunker-code', source.graph, source.structure);
  const selectedPackage = selectWorkspacePackage(initial, workspacePackageId);
  const selectedOrientation = createExplorerOrientation(selectedPackage, 'bunker-code', source.graph, source.structure);
  const openedPackage = openSelectedWorkspacePackage(selectedPackage);

  assert.equal(initialOrientation.scale, 'system-map');
  assert.equal(initialOrientation.backAction, undefined);
  assert.equal(selectedOrientation.scale, 'system-map');
  assert.equal(openedPackage?.scope, 'workspace-package');
  if (!openedPackage) return;

  const partOrientation = createExplorerOrientation(openedPackage, 'bunker-code', source.graph, source.structure);
  const selectedFile = selectFileNode(openedPackage, focusedFileId);
  const selectedFileOrientation = createExplorerOrientation(selectedFile, 'bunker-code', source.graph, source.structure);
  const focused = focusFileNode(selectedFile, focusedFileId);
  const focusOrientation = createExplorerOrientation(focused, 'bunker-code', source.graph, source.structure);

  assert.equal(partOrientation.scale, 'part-files');
  assert.deepEqual(partOrientation.backAction, { label: 'Back to system map', target: 'system' });
  assert.deepEqual(partOrientation.trail.map((item) => item.label), ['bunker-code', '@bunker-code/analyzer-typescript']);
  assert.deepEqual(partOrientation.trail.map((item) => item.target), ['system', undefined]);
  assert.equal(selectedFileOrientation.scale, 'part-files');
  assert.equal(focusOrientation.scale, 'file-connections');
  assert.equal(focusOrientation.focusedFileLabel, 'analyze-project.ts');
  assert.deepEqual(focusOrientation.trail.map((item) => item.label), [
    'bunker-code',
    '@bunker-code/analyzer-typescript',
    'analyze-project.ts',
  ]);
  assert.deepEqual(focusOrientation.trail.map((item) => item.target), ['system', 'files', undefined]);
  assert.deepEqual(focusOrientation.backAction, {
    label: 'Back to analyzer-typescript files',
    target: 'files',
  });

  const clearedSelection = selectFileNode(focused, null);
  const expanded = expandFileNode(clearedSelection, focusedFileId);
  const inspectedContext = selectFileNode(expanded, inspectedContextId);
  const returnedToFiles = returnToFileOverview(inspectedContext);
  const returnedOrientation = createExplorerOrientation(returnedToFiles, 'bunker-code', source.graph, source.structure);

  assert.equal(createExplorerOrientation(clearedSelection, 'bunker-code', source.graph, source.structure).scale, 'file-connections');
  assert.equal(createExplorerOrientation(expanded, 'bunker-code', source.graph, source.structure).scale, 'file-connections');
  assert.equal(expanded.expandedNodeIds.has(focusedFileId), true);
  assert.equal(returnedOrientation.scale, 'part-files');
  assert.equal(returnedToFiles.selectedNodeId, focusedFileId);
  assert.equal(returnedToFiles.focusedNodeId, null);
  assert.deepEqual(returnedToFiles.expandedNodeIds, new Set());
  assert.deepEqual(returnToSystem(returnedToFiles), { scope: 'system', selectedPackageId: workspacePackageId });

  const visibleSearchSelection = selectSearchResultFile(focused, 'packages/analyzer-typescript/src/index.ts', true);
  const hiddenSearchSelection = selectSearchResultFile(focused, 'packages/analyzer-typescript/src/pnpm-workspace.ts', false);
  assert.equal(createExplorerOrientation(visibleSearchSelection, 'bunker-code', source.graph, source.structure).scale, 'file-connections');
  assert.equal(createExplorerOrientation(hiddenSearchSelection, 'bunker-code', source.graph, source.structure).scale, 'part-files');
  assert.equal(hiddenSearchSelection.selectedNodeId, 'packages/analyzer-typescript/src/pnpm-workspace.ts');
  assert.equal(hiddenSearchSelection.focusedNodeId, null);
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
  const orientation = createExplorerOrientation(initial, 'analyzer-typescript', source.graph, source.structure);

  assert.equal(runtime.kind, 'ready');
  if (runtime.kind !== 'ready') return;
  assert.equal(runtime.projectLabel, 'Analyzed project');
  assert.equal(initial.scope, 'file-overview');
  assert.equal(orientation.scale, 'project-files');
  assert.equal(orientation.backAction, undefined);
  assert.equal(projection.mode, 'overview');
  assert.equal(projection.systemSummary, undefined);
  assert.equal(projection.nodes.every((node) => node.kind === 'file'), true);

  const focused = focusFileNode(initial, 'src/analysis-result.ts');
  const focusOrientation = createExplorerOrientation(focused, 'analyzer-typescript', source.graph, source.structure);
  assert.equal(focusOrientation.scale, 'file-connections');
  assert.deepEqual(focusOrientation.backAction, { label: 'Back to project files', target: 'files' });
  assert.equal(returnToFileOverview(focused).selectedNodeId, 'src/analysis-result.ts');
});

test('workspace runtime consumes supplied package dependencies without rebuilding them in the Web layer', () => {
  const analysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const packageDependencies = aggregatePackageDependencies(graph, structure);
  const runtime = createExplorerRuntime({ analysis, packageDependencies, projectLabel: 'workspace-fixture' });

  assert.equal(runtime.kind, 'ready');
  if (runtime.kind !== 'ready') return;
  assert.deepEqual(runtime.packageDependencies, packageDependencies);
  assert.equal(runtime.projectLabel, 'workspace-fixture');
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
  assert.equal(laidOut.mode, 'system');
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
