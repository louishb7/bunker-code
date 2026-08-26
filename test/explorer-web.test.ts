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
import { createPackageExploration } from '../apps/explorer-web/src/package-exploration.js';
import { createFileExploration } from '../apps/explorer-web/src/file-exploration.js';
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
import {
  describeRelationship,
  relationshipDirectionHelp,
  relationshipDirectionKey,
  relationshipRole,
} from '../apps/explorer-web/src/relationship-language.js';
import {
  explorerVocabulary,
  systemMapVocabularyPlacement,
  vocabularyConceptIds,
  vocabularyForPlacement,
} from '../apps/explorer-web/src/explorer-vocabulary.js';
import {
  createExplorerAttention,
  explorerAttentionEdgeKey,
} from '../apps/explorer-web/src/explorer-attention.js';

const fileDatasetPath = path.resolve('packages/analyzer-typescript');
const workspaceDatasetPath = path.resolve('.');
const workspacePackageId = 'workspace-package:packages/analyzer-typescript';
const contractsPackageId = 'workspace-package:packages/contracts';
let fileSource: ExplorerSource | undefined;
let workspaceSource: ExplorerSource | undefined;

function structureForFiles(files: Array<{ id: string; path: string }>) {
  return buildProjectStructure({
    schemaVersion: 1,
    analyzer: { name: 'explorer-test', language: 'typescript' },
    projectPath: '.',
    tsconfigPath: 'tsconfig.json',
    files,
    dependencies: [],
    unresolvedDependencies: [],
    diagnostics: [],
  });
}

function createFileSource(): ExplorerSource {
  if (fileSource) return fileSource;
  const analysis = analyzeProject(fileDatasetPath);
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  fileSource = { graph, structure, packageDependencies: aggregatePackageDependencies(graph, structure) };
  return fileSource;
}

function createWorkspaceSource(): ExplorerSource {
  if (workspaceSource) return workspaceSource;
  const analysis = analyzeProject(workspaceDatasetPath);
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  workspaceSource = { graph, structure, packageDependencies: aggregatePackageDependencies(graph, structure) };
  return workspaceSource;
}

test('system projection renders every detected workspace package and uses only aggregated package dependencies', () => {
  const source = createWorkspaceSource();
  const projection = createExplorerProjection(source, { scope: 'system', selectedPackageId: null });
  const systemParts = projection.nodes.filter((node) => node.kind === 'workspace-package');
  const analyzedFileCount = source.graph.nodes.filter((node) => node.kind === 'file').length;
  const elements = createExplorerElements(projection);

  assert.equal(source.structure.units.some((unit) => unit.kind === 'directory'), true);
  assert.equal(createInitialExplorerState(source.structure).scope, 'system');
  assert.equal(projection.mode, 'system');
  assert.equal(projection.systemSummary?.detectedPartCount, source.structure.packages.length);
  assert.equal(projection.systemSummary?.analyzedFileCount, analyzedFileCount);
  assert.deepEqual(projection.nodes.map((node) => node.id), source.structure.packages.map((workspacePackage) => workspacePackage.id));
  assert.equal(projection.nodes.every((node) => node.kind === 'workspace-package'), true);
  assert.equal(projection.nodes.some((node) => node.id.startsWith('directory:')), false);
  assert.equal(projection.nodes.some((node) => node.id === contractsPackageId), true);
  assert.equal(projection.nodes.every((node) => node.kind !== 'external'), true);
  assert.equal(projection.edges.every((edge) => edge.kind === 'package-dependency'), true);
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
  const analyzerContractsEdge = elements.edges.find((edge) => (
    edge.source === workspacePackageId && edge.target === contractsPackageId
  ));
  assert.equal(analyzerContractsEdge?.markerEnd && typeof analyzerContractsEdge.markerEnd === 'object'
    ? analyzerContractsEdge.markerEnd.type
    : undefined, 'arrowclosed');
  assert.equal(analyzerContractsEdge?.ariaLabel, 'analyzer-typescript uses contracts');
  assert.equal(analyzerContractsEdge?.data?.accessibleLabel, 'analyzer-typescript uses contracts');
  assert.equal(elements.edges.every((edge) => edge.markerEnd !== undefined), true);
  assert.deepEqual(
    projection.nodes.filter((node) => node.kind === 'workspace-package' && node.filesystemGroup).map((node) => node.filesystemGroup),
    ['apps', 'apps', 'packages', 'packages', 'packages'],
  );

  const analyzerPart = systemParts.find((part) => part.id === workspacePackageId);
  assert.ok(analyzerPart);
  const exploration = createPackageExploration(analyzerPart, systemParts, source.packageDependencies);
  assert.equal(exploration.presentationLabel, 'analyzer-typescript');
  assert.equal(exploration.technicalIdentity, '@bunker-code/analyzer-typescript');
  assert.equal(exploration.fileCount, 4);
  assert.equal(exploration.location, 'packages/analyzer-typescript');
  assert.deepEqual(exploration.uses.map((relation) => relation.relatedLabel), ['contracts']);
  assert.deepEqual(exploration.usedBy.map((relation) => relation.relatedLabel), ['cli', 'explorer-web']);
  assert.equal(exploration.uses[0]?.sourceLabel, 'analyzer-typescript');
  assert.equal(exploration.uses[0]?.targetLabel, 'contracts');
  assert.equal(exploration.uses[0]?.fileDependencies.length, 2);
  assert.deepEqual(exploration.evidence.map((evidence) => evidence.kind), [
    'workspace-configuration',
    'workspace-pattern',
    'package-manifest',
  ]);
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
  assert.ok(isolatedPart?.kind === 'workspace-package');
  if (isolatedPart?.kind !== 'workspace-package') return;
  const exploration = createPackageExploration(
    isolatedPart,
    projection.nodes.filter((node) => node.kind === 'workspace-package'),
    source.packageDependencies,
  );
  assert.equal(exploration.isolatedExplanation, 'No detected connections to other parts.');
  assert.equal(exploration.canOpenFiles, true);
});

test('detected packages without names or analyzed files remain safe to project and explain', async () => {
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
  const systemParts = systemProjection.nodes.filter((node) => node.kind === 'workspace-package');
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
  assert.ok(emptyNode?.kind === 'workspace-package');
  const libraryPart = systemParts.find((node) => node.id === libraryPackageId);
  assert.ok(libraryPart);
  if (emptyNode?.kind !== 'workspace-package' || !libraryPart) return;
  const unnamedExploration = createPackageExploration(libraryPart, systemParts, source.packageDependencies);
  const zeroFileExploration = createPackageExploration(emptyNode, systemParts, source.packageDependencies);
  assert.equal(unnamedExploration.presentationLabel, 'library');
  assert.equal(unnamedExploration.technicalIdentity, 'packages/library');
  assert.equal(zeroFileExploration.fileCount, 0);
  assert.equal(zeroFileExploration.canOpenFiles, false);
  assert.equal(zeroFileExploration.zeroFileExplanation, 'No analyzed TypeScript files were found in this detected part.');
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

// Phase 5 characterization boundary: preserve observable search, breadcrumb,
// attention, inspector-evidence, focus, and navigation-target behavior. Do not
// preserve the package-only scope names or package-card presentation.
test('characterization preserves navigation callbacks, search, attention, and evidence contracts', () => {
  const source = createWorkspaceSource();
  const packageState = {
    scope: 'workspace-package' as const,
    packageId: workspacePackageId,
    selectedNodeId: 'packages/analyzer-typescript/src/analysis-result.ts',
    focusedNodeId: null,
    expandedNodeIds: new Set<string>(),
  };
  const visibleProjection = createExplorerProjection(source, packageState);
  const focusedState = focusFileNode(packageState, packageState.selectedNodeId);
  const focusedProjection = createExplorerProjection(source, focusedState);
  const orientation = createExplorerOrientation(focusedState, 'bunker-code', source.graph, source.structure);
  const attention = createExplorerAttention(focusedProjection, focusedState);
  const selectedFile = source.graph.nodes.find((node) => node.id === packageState.selectedNodeId);

  assert.ok(selectedFile);
  assert.equal(orientation.trail.at(-1)?.id, packageState.selectedNodeId);
  assert.equal(orientation.trail.find((item) => item.id === packageState.packageId)?.target, 'files');
  assert.equal(searchExplorerFiles(source.graph, 'analysis-result.ts').some((result) => (
    result.nodeId === packageState.selectedNodeId && result.path === selectedFile.path
  )), true);
  assert.equal(attention.nodes.get(packageState.selectedNodeId)?.role, 'anchor');
  assert.equal(attention.nodes.get(packageState.selectedNodeId)?.selected, true);

  const exploration = createFileExploration(
    selectedFile,
    source.graph,
    source.structure,
    packageState,
    visibleProjection.visibleNodeIds,
  );
  assert.equal(exploration.uses.every((relation) => relation.occurrences.every((edge) => (
    edge.evidence.location.filePath.length > 0
    && Number.isInteger(edge.evidence.location.line)
    && Number.isInteger(edge.evidence.location.column)
    && ['exact', 'inferred', 'uncertain'].includes(edge.confidence)
  ))), true);

  const hiddenResult = selectSearchResultFile(focusedState, 'packages/analyzer-typescript/src/pnpm-workspace.ts', false);
  assert.equal(hiddenResult.focusedNodeId, null);
  assert.equal(hiddenResult.selectedNodeId, 'packages/analyzer-typescript/src/pnpm-workspace.ts');
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
  const elements = createExplorerElements(projection);
  const contextualEdge = elements.edges.find((edge) => edge.target === contextualContractsFile);
  assert.ok(contextualEdge);
  assert.equal(contextualEdge.source.startsWith('packages/analyzer-typescript/'), true);
  assert.equal(contextualEdge.ariaLabel?.endsWith('uses index.ts'), true);
  assert.equal(contextualEdge.markerEnd && typeof contextualEdge.markerEnd === 'object'
    ? contextualEdge.markerEnd.type
    : undefined, 'arrowclosed');
});

test('file exploration separates identity and ownership while grouping every exact relationship occurrence', () => {
  const source = createWorkspaceSource();
  const analysisResultFileId = 'packages/analyzer-typescript/src/analysis-result.ts';
  const analyzeProjectFileId = 'packages/analyzer-typescript/src/analyze-project.ts';
  const contractsFileId = 'packages/contracts/src/index.ts';
  const overviewState = {
    scope: 'workspace-package' as const,
    packageId: workspacePackageId,
    selectedNodeId: analysisResultFileId,
    focusedNodeId: null,
    expandedNodeIds: new Set<string>(),
  };
  const overview = createExplorerProjection(source, overviewState);
  const analysisResultNode = source.graph.nodes.find((node) => node.id === analysisResultFileId);
  const contractsNode = source.graph.nodes.find((node) => node.id === contractsFileId);
  assert.ok(analysisResultNode);
  assert.ok(contractsNode);

  const owned = createFileExploration(
    analysisResultNode,
    source.graph,
    source.structure,
    overviewState,
    overview.visibleNodeIds,
  );
  const contextual = createFileExploration(
    contractsNode,
    source.graph,
    source.structure,
    { ...overviewState, selectedNodeId: contractsFileId },
    overview.visibleNodeIds,
  );

  assert.equal(owned.presentationLabel, 'analysis-result.ts');
  assert.equal(owned.location, analysisResultFileId);
  assert.equal(owned.kind, 'owned-file');
  assert.equal(owned.contextLabel, 'File in this part');
  assert.equal(owned.ownerPartLabel, 'analyzer-typescript');
  assert.equal(owned.canFocus, true);
  assert.equal(owned.uses.length, 1);
  assert.equal(owned.uses[0]?.relatedNodeId, contractsFileId);
  assert.equal(owned.uses[0]?.relatedLabel, 'index.ts');
  assert.equal(owned.uses[0]?.relatedContextLabel, 'From contracts');
  assert.equal(owned.uses[0]?.sourceNodeId, analysisResultFileId);
  assert.equal(owned.uses[0]?.targetNodeId, contractsFileId);
  assert.equal(owned.uses[0]?.occurrences.length, 2);
  assert.equal(owned.rawUsesCount, 2);
  assert.equal(owned.usedBy.length, 3);
  assert.equal(owned.rawUsedByCount, 5);
  const analyzeProjectRelation = owned.usedBy.find((relation) => relation.relatedNodeId === analyzeProjectFileId);
  const expectedOccurrences = source.graph.edges.filter((edge) => (
    edge.sourceNodeId === analyzeProjectFileId && edge.targetNodeId === analysisResultFileId
  ));
  assert.equal(analyzeProjectRelation?.occurrences.length, 2);
  assert.deepEqual(analyzeProjectRelation?.occurrences.map((edge) => ({
    moduleSpecifier: edge.moduleSpecifier,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    filePath: edge.evidence.location.filePath,
    line: edge.evidence.location.line,
    column: edge.evidence.location.column,
    confidence: edge.confidence,
  })), expectedOccurrences.map((edge) => ({
    moduleSpecifier: edge.moduleSpecifier,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    filePath: edge.evidence.location.filePath,
    line: edge.evidence.location.line,
    column: edge.evidence.location.column,
    confidence: edge.confidence,
  })));
  assert.equal(analyzeProjectRelation?.occurrences.every((edge) => (
    edge.moduleSpecifier.length > 0
    && edge.evidence.location.filePath.length > 0
    && Number.isInteger(edge.evidence.location.line)
    && Number.isInteger(edge.evidence.location.column)
    && ['exact', 'inferred', 'uncertain'].includes(edge.confidence)
  )), true);

  assert.equal(contextual.presentationLabel, 'index.ts');
  assert.equal(contextual.location, contractsFileId);
  assert.equal(contextual.kind, 'contextual-file');
  assert.equal(contextual.contextLabel, 'From another part');
  assert.equal(contextual.ownerPartLabel, 'contracts');
  assert.equal(contextual.contextExplanation?.includes('connects to files in the part'), true);
  assert.equal(contextual.canFocus, false);
  assert.equal(contextual.canExpand, false);

  const collidingStructure = {
    ...source.structure,
    packages: source.structure.packages.map((workspacePackage) => (
      workspacePackage.id === workspacePackageId
        ? { ...workspacePackage, name: '@scope-one/shared' }
        : workspacePackage.id === contractsPackageId
          ? { ...workspacePackage, name: '@scope-two/shared' }
          : workspacePackage
    )),
  };
  const collidingSource = { ...source, structure: collidingStructure };
  const collidingProjection = createExplorerProjection(collidingSource, overviewState);
  const collisionSafeContextual = createFileExploration(
    contractsNode,
    source.graph,
    collidingStructure,
    { ...overviewState, selectedNodeId: contractsFileId },
    collidingProjection.visibleNodeIds,
  );
  const collisionSafeCanvasNode = createExplorerElements(collidingProjection).nodes.find((node) => node.id === contractsFileId);
  assert.equal(collisionSafeContextual.ownerPartLabel, '@scope-two/shared');
  assert.equal(collisionSafeCanvasNode?.data.subtitle, 'From @scope-two/shared');
});

test('file exploration distinguishes external, anchor, inspected neighbor, and project-file empty states', () => {
  const source = createWorkspaceSource();
  const anchorFileId = 'packages/analyzer-typescript/src/analyze-project.ts';
  const neighborFileId = 'packages/analyzer-typescript/src/analysis-result.ts';
  const focusState = {
    scope: 'workspace-package' as const,
    packageId: workspacePackageId,
    selectedNodeId: anchorFileId,
    focusedNodeId: anchorFileId,
    expandedNodeIds: new Set<string>(),
  };
  const focused = createExplorerProjection(source, focusState);
  const anchorNode = source.graph.nodes.find((node) => node.id === anchorFileId);
  const neighborNode = source.graph.nodes.find((node) => node.id === neighborFileId);
  const externalNode = focused.nodes.find((node) => node.kind === 'external' && node.moduleSpecifier === 'ts-morph');
  assert.ok(anchorNode);
  assert.ok(neighborNode);
  assert.ok(externalNode);

  const anchor = createFileExploration(anchorNode, source.graph, source.structure, focusState, focused.visibleNodeIds);
  const neighbor = createFileExploration(
    neighborNode,
    source.graph,
    source.structure,
    { ...focusState, selectedNodeId: neighborFileId },
    focused.visibleNodeIds,
  );
  const external = createFileExploration(
    externalNode,
    source.graph,
    source.structure,
    { ...focusState, selectedNodeId: externalNode.id },
    focused.visibleNodeIds,
  );

  assert.equal(anchor.anchor?.label, 'analyze-project.ts');
  assert.equal(anchor.anchor?.isSelected, true);
  assert.equal(anchor.canFocus, false);
  assert.equal(anchor.actionUnavailableExplanation, 'This file is already the connection anchor.');
  assert.equal(neighbor.anchor?.label, 'analyze-project.ts');
  assert.equal(neighbor.anchor?.isSelected, false);
  assert.equal(neighbor.canExpand, true);
  assert.equal(external.kind, 'external-module');
  assert.equal(external.presentationLabel, 'ts-morph');
  assert.equal(external.contextLabel, 'Outside this analyzed system');
  assert.equal(external.technicalKind, 'external');
  assert.equal(external.canFocus, false);
  assert.equal(external.canExpand, false);
  assert.equal(external.contextExplanation?.includes('does not imply a remote service'), true);
  assert.equal(external.usedBy.length, 1);
  assert.equal(external.usedBy[0]?.sourceNodeId, anchorFileId);
  assert.equal(external.usedBy[0]?.targetNodeId, externalNode.id);
  assert.equal(external.usedBy[0]?.occurrences[0]?.moduleSpecifier, 'ts-morph');
  assert.equal(external.usedBy[0]?.occurrences[0]?.evidence.location.filePath, anchorFileId);
  assert.equal(external.usedBy[0]?.occurrences[0]?.confidence, 'inferred');

  const isolatedNode = { id: 'src/isolated.ts', kind: 'file' as const, path: 'src/isolated.ts' };
  const isolatedGraph = { nodes: [isolatedNode], edges: [], unresolvedDependencies: [] };
  const isolatedStructure = structureForFiles([isolatedNode]);
  const projectState = createFileOverviewExplorerState();
  const isolated = createFileExploration(
    isolatedNode,
    isolatedGraph,
    isolatedStructure,
    projectState,
    new Set([isolatedNode.id]),
  );

  assert.equal(isolated.kind, 'project-file');
  assert.equal(isolated.contextLabel, 'Analyzed file');
  assert.equal(isolated.ownerPartLabel, undefined);
  assert.equal(isolated.uses.length, 0);
  assert.equal(isolated.usedBy.length, 0);
  assert.equal(isolated.usesEmptyMessage, 'No detected outgoing connections.');
  assert.equal(isolated.usedByEmptyMessage, 'No detected files use this item.');
  assert.equal(isolated.canFocus, true);
});

test('file focus, expansion, and search retain their existing file-level behavior', () => {
  const source = createFileSource();
  const focusedFileId = 'src/analyze-project.ts';
  const expandedFileId = 'src/analysis-result.ts';
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
  assert.equal(focused.nodes.some((node) => node.id === 'external:node:fs'), true);
  assert.equal(expanded.nodes.some((node) => node.id === 'external:node:fs'), true);
  const focusedElements = createExplorerElements(focused);
  const externalRelationship = focusedElements.edges.find((edge) => edge.target === 'external:node:fs');
  assert.ok(externalRelationship);
  assert.equal(externalRelationship.source, focusedFileId);
  assert.equal(externalRelationship.ariaLabel, 'analyze-project.ts uses node:fs');
  assert.equal(externalRelationship.markerEnd && typeof externalRelationship.markerEnd === 'object'
    ? externalRelationship.markerEnd.type
    : undefined, 'arrowclosed');
  assert.equal(externalRelationship.data?.occurrenceCount, 1);
  assert.equal(externalRelationship.data?.relations.length, 1);
  assert.deepEqual(searchExplorerFiles(source.graph, 'analysis-result.ts'), [{
    nodeId: 'src/analysis-result.ts',
    fileName: 'analysis-result.ts',
    path: 'src/analysis-result.ts',
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
  assert.equal(runtime.structure.units.some((unit) => unit.kind === 'directory'), true);
  assert.deepEqual(
    runtime.structure.sourceReports.find((report) => report.source === 'pnpm-workspace'),
    { source: 'pnpm-workspace', status: 'not-reported' },
  );
  assert.equal(initial.scope, 'file-overview');
  assert.equal(orientation.scale, 'project-files');
  assert.equal(orientation.backAction, undefined);
  assert.equal(projection.mode, 'overview');
  assert.equal(projection.systemSummary, undefined);
  assert.equal(projection.nodes.every((node) => node.kind === 'file'), true);
  assert.equal(projection.nodes.some((node) => node.id.startsWith('directory:')), false);

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

test('relationship presentation names source and target without reversing analytical direction', () => {
  const relationship = { sourceNodeId: workspacePackageId, targetNodeId: contractsPackageId };

  assert.equal(relationshipDirectionKey, 'A → B means A uses B');
  assert.equal(relationshipDirectionHelp, 'Arrow points to what is used.');
  assert.equal(describeRelationship('Analyzer', 'Contracts'), 'Analyzer uses Contracts');
  assert.equal(relationshipRole(workspacePackageId, relationship), 'uses');
  assert.equal(relationshipRole(contractsPackageId, relationship), 'used-by');
  assert.equal(relationshipRole('workspace-package:packages/isolated', relationship), 'unrelated');
});

test('system attention keeps the neutral map equal and forms a selected directed neighborhood without hiding isolation', () => {
  const source = createWorkspaceSource();
  const neutralState = { scope: 'system' as const, selectedPackageId: null };
  const neutralProjection = createExplorerProjection(source, neutralState);
  const neutral = createExplorerAttention(neutralProjection, neutralState);

  assert.equal([...neutral.nodes.values()].every((node) => node.role === 'baseline' && !node.selected), true);
  assert.equal([...neutral.edges.values()].every((edge) => edge.role === 'baseline'), true);

  const selectedState = selectWorkspacePackage(neutralState, workspacePackageId);
  const selectedProjection = createExplorerProjection(source, selectedState);
  const selected = createExplorerAttention(selectedProjection, selectedState);

  assert.deepEqual(selected.nodes.get(workspacePackageId), {
    role: 'selected',
    selected: true,
    anchorRelationshipRole: 'unrelated',
    selectedRelationshipRole: 'unrelated',
  });
  assert.equal(selected.nodes.get(contractsPackageId)?.role, 'direct');
  assert.equal(selected.nodes.get(contractsPackageId)?.selectedRelationshipRole, 'uses');
  assert.equal(selected.nodes.get('workspace-package:apps/cli')?.role, 'direct');
  assert.equal(selected.nodes.get('workspace-package:apps/cli')?.selectedRelationshipRole, 'used-by');
  assert.equal(selected.nodes.get('workspace-package:apps/explorer-web')?.role, 'direct');
  assert.equal(selected.nodes.get('workspace-package:packages/graph-engine')?.role, 'subdued');
  assert.equal(selectedProjection.nodes.some((node) => node.id === 'workspace-package:packages/graph-engine'), true);
  assert.equal(selected.edges.get(explorerAttentionEdgeKey(
    'package-dependency',
    workspacePackageId,
    contractsPackageId,
  ))?.role, 'direct');
  assert.deepEqual(selectedProjection.edges.map((edge) => [edge.sourceNodeId, edge.targetNodeId]),
    neutralProjection.edges.map((edge) => [edge.sourceNodeId, edge.targetNodeId]));

  const cleared = createExplorerAttention(neutralProjection, selectWorkspacePackage(selectedState, null));
  assert.equal([...cleared.nodes.values()].every((node) => node.role === 'baseline'), true);
  assert.equal([...cleared.edges.values()].every((edge) => edge.role === 'baseline'), true);

  const fixtureAnalysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const fixtureGraph = buildProjectGraph(fixtureAnalysis);
  const fixtureStructure = buildProjectStructure(fixtureAnalysis);
  const fixtureSource = {
    graph: fixtureGraph,
    structure: fixtureStructure,
    packageDependencies: aggregatePackageDependencies(fixtureGraph, fixtureStructure),
  };
  const fixtureState = { scope: 'system' as const, selectedPackageId: 'workspace-package:packages/library' };
  const fixtureProjection = createExplorerProjection(fixtureSource, fixtureState);
  const fixtureAttention = createExplorerAttention(fixtureProjection, fixtureState);
  assert.equal(fixtureProjection.nodes.some((node) => node.id === 'workspace-package:packages/isolated'), true);
  assert.equal(fixtureAttention.nodes.get('workspace-package:packages/isolated')?.role, 'subdued');
});

test('file-overview attention prioritizes selection and direct owned, contextual, and external relationships', () => {
  const source = createWorkspaceSource();
  const selectedFileId = 'packages/analyzer-typescript/src/analysis-result.ts';
  const contextualFileId = 'packages/contracts/src/index.ts';
  const neutralState = {
    scope: 'workspace-package' as const,
    packageId: workspacePackageId,
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set<string>(),
  };
  const neutralProjection = createExplorerProjection(source, neutralState);
  const neutral = createExplorerAttention(neutralProjection, neutralState);
  assert.equal([...neutral.nodes.values()].every((node) => node.role === 'baseline'), true);

  const selectedState = selectFileNode(neutralState, selectedFileId);
  const selectedProjection = createExplorerProjection(source, selectedState);
  const selected = createExplorerAttention(selectedProjection, selectedState);
  const contextualNode = selectedProjection.nodes.find((node) => node.id === contextualFileId);

  assert.equal(selected.nodes.get(selectedFileId)?.role, 'selected');
  assert.equal(selected.nodes.get(selectedFileId)?.selected, true);
  assert.equal(selected.nodes.get('packages/analyzer-typescript/src/analyze-project.ts')?.role, 'direct');
  assert.equal(selected.nodes.get('apps/cli/src/main.ts')?.role, 'subdued');
  assert.equal(contextualNode?.kind === 'file' ? contextualNode.scopeRole : undefined, 'contextual');
  assert.equal(selected.nodes.get(contextualFileId)?.role, 'direct');
  assert.equal(selected.nodes.get(contextualFileId)?.selectedRelationshipRole, 'uses');

  const searchedState = selectSearchResultFile(neutralState, selectedFileId, true);
  assert.equal(createExplorerAttention(selectedProjection, searchedState).nodes.get(selectedFileId)?.role, 'selected');

  const focusAnchorId = 'packages/analyzer-typescript/src/analyze-project.ts';
  const focusedState = focusFileNode(selectFileNode(neutralState, focusAnchorId), focusAnchorId);
  const focusedProjection = createExplorerProjection(source, focusedState);
  const focused = createExplorerAttention(focusedProjection, focusedState);
  assert.equal(focused.nodes.get('external:node:fs')?.role, 'direct');
  assert.equal(focused.nodes.get('external:node:fs')?.anchorRelationshipRole, 'uses');

  const selectedExternalState = selectFileNode(focusedState, 'external:node:fs');
  const selectedExternal = createExplorerAttention(focusedProjection, selectedExternalState);
  assert.equal(selectedExternal.nodes.get('external:node:fs')?.role, 'direct');
  assert.equal(selectedExternal.nodes.get('external:node:fs')?.selected, true);

  const fallbackSource = createFileSource();
  const fallbackState = createFileOverviewExplorerState();
  const fallbackProjection = createExplorerProjection(fallbackSource, fallbackState);
  assert.equal([...createExplorerAttention(fallbackProjection, fallbackState).nodes.values()].every((node) => node.role === 'baseline'), true);
  const fallbackSelected = selectFileNode(fallbackState, 'src/analysis-result.ts');
  assert.equal(createExplorerAttention(fallbackProjection, fallbackSelected).nodes.get('src/analysis-result.ts')?.role, 'selected');

  const isolatedNode = { id: 'src/isolated.ts', kind: 'file' as const, path: 'src/isolated.ts' };
  const isolatedSource: ExplorerSource = {
    graph: { nodes: [isolatedNode], edges: [], unresolvedDependencies: [] },
    structure: structureForFiles([isolatedNode]),
    packageDependencies: [],
  };
  const isolatedProjection = createExplorerProjection(isolatedSource, fallbackState);
  assert.equal(isolatedProjection.nodes.some((node) => node.id === isolatedNode.id), true);
  assert.equal(createExplorerAttention(isolatedProjection, fallbackState).nodes.get(isolatedNode.id)?.role, 'baseline');
});

test('file-connections attention keeps anchor priority above inspection and marks one-more-step context explicitly', () => {
  const source = createWorkspaceSource();
  const anchorId = 'packages/analyzer-typescript/src/analyze-project.ts';
  const neighborId = 'packages/analyzer-typescript/src/analysis-result.ts';
  const additionalContextId = 'packages/contracts/src/index.ts';
  const anchorState = {
    scope: 'workspace-package' as const,
    packageId: workspacePackageId,
    selectedNodeId: anchorId,
    focusedNodeId: anchorId,
    expandedNodeIds: new Set<string>(),
  };
  const anchorProjection = createExplorerProjection(source, anchorState);
  const anchorAttention = createExplorerAttention(anchorProjection, anchorState);

  assert.equal(anchorAttention.nodes.get(anchorId)?.role, 'anchor');
  assert.equal(anchorAttention.nodes.get(anchorId)?.selected, true);
  assert.equal(anchorAttention.nodes.get(neighborId)?.role, 'direct');
  assert.equal(anchorAttention.nodes.get('packages/analyzer-typescript/src/index.ts')?.anchorRelationshipRole, 'used-by');
  assert.equal(anchorAttention.edges.get(explorerAttentionEdgeKey(
    'file-dependency',
    anchorId,
    neighborId,
  ))?.role, 'direct');

  const inspectedNeighborState = selectFileNode(anchorState, neighborId);
  const inspectedNeighbor = createExplorerAttention(anchorProjection, inspectedNeighborState);
  assert.equal(inspectedNeighbor.nodes.get(anchorId)?.role, 'anchor');
  assert.equal(inspectedNeighbor.nodes.get(anchorId)?.selected, false);
  assert.equal(inspectedNeighbor.nodes.get(neighborId)?.role, 'direct');
  assert.equal(inspectedNeighbor.nodes.get(neighborId)?.selected, true);

  const clearedSelection = selectFileNode(inspectedNeighborState, null);
  const clearedAttention = createExplorerAttention(anchorProjection, clearedSelection);
  assert.equal(clearedAttention.nodes.get(anchorId)?.role, 'anchor');
  assert.equal([...clearedAttention.nodes.values()].every((node) => !node.selected), true);

  const expandedState = expandFileNode(inspectedNeighborState, neighborId);
  const expandedProjection = createExplorerProjection(source, expandedState);
  const expandedAttention = createExplorerAttention(expandedProjection, expandedState);
  assert.equal(expandedAttention.nodes.get(anchorId)?.role, 'anchor');
  assert.equal(expandedAttention.nodes.get(neighborId)?.role, 'direct');
  assert.equal(expandedAttention.nodes.get(additionalContextId)?.role, 'additional-context');

  const selectedContextState = selectFileNode(expandedState, additionalContextId);
  const selectedContext = createExplorerAttention(expandedProjection, selectedContextState);
  assert.equal(selectedContext.nodes.get(anchorId)?.role, 'anchor');
  assert.equal(selectedContext.nodes.get(additionalContextId)?.role, 'additional-context');
  assert.equal(selectedContext.nodes.get(additionalContextId)?.selected, true);

  const returnedState = returnToFileOverview(selectedContextState);
  const returnedProjection = createExplorerProjection(source, returnedState);
  const returnedAttention = createExplorerAttention(returnedProjection, returnedState);
  assert.equal(returnedState.focusedNodeId, null);
  assert.equal(returnedAttention.nodes.get(anchorId)?.role, 'selected');
  assert.equal([...returnedAttention.nodes.values()].some((node) => node.role === 'anchor'), false);
});

test('vocabulary definitions keep stable identities and introduce workspace language only for detected structure', () => {
  assert.deepEqual(Object.keys(explorerVocabulary), vocabularyConceptIds);
  assert.equal(new Set(vocabularyConceptIds).size, vocabularyConceptIds.length);
  assert.equal(vocabularyConceptIds.every((conceptId) => explorerVocabulary[conceptId].id === conceptId), true);
  assert.equal(systemMapVocabularyPlacement(false), null);
  assert.equal(systemMapVocabularyPlacement(true), 'system-map');
  assert.deepEqual(vocabularyForPlacement('system-map').map((concept) => concept.id), [
    'detected-part',
    'workspace',
    'workspace-package',
    'analyzed-file',
  ]);
  assert.equal(explorerVocabulary.workspace.technicalTerm, 'PNPM workspace');
  assert.equal(explorerVocabulary.workspace.explanation.includes('pnpm-workspace.yaml'), true);
  assert.equal(explorerVocabulary['workspace-package'].friendlyTerm, 'Part of this system');
  assert.equal(explorerVocabulary['workspace-package'].technicalTerm, 'Workspace package');
  assert.equal(explorerVocabulary['workspace-package'].explanation.includes('package.json'), true);
  assert.equal(explorerVocabulary['filesystem-group'].explanation.includes('not a detected architectural role'), true);
});

test('relationship and exceptional-context vocabulary preserve direction and ownership guardrails', () => {
  const relationshipVocabulary = vocabularyForPlacement('relationship-direction');
  const dependency = explorerVocabulary.dependency;
  const dependent = explorerVocabulary.dependent;
  const external = explorerVocabulary['external-module'];
  const contextual = explorerVocabulary['contextual-file'];

  assert.deepEqual(relationshipVocabulary.map((concept) => [concept.friendlyTerm, concept.technicalTerm]), [
    ['Uses', 'Dependency'],
    ['Used by', 'Dependent'],
  ]);
  assert.equal(dependency.explanation.includes('A → B means A uses B'), true);
  assert.equal(dependent.explanation.includes('If B is used by A, A is a dependent of B'), true);
  assert.equal(dependent.explanation.includes('without reversing'), true);
  assert.equal(external.explanation.includes('did not resolve to an analyzed internal file'), true);
  assert.equal(external.explanation.includes('does not prove a remote service'), true);
  assert.equal(external.explanation.includes('third-party SaaS'), true);
  assert.equal(external.explanation.includes('confirmed npm package'), true);
  assert.equal(contextual.friendlyTerm, 'From another part');
  assert.equal(contextual.explanation.includes('belongs to another detected part'), true);
  assert.equal(contextual.explanation.includes('owner does not change'), true);
  assert.equal(contextual.explanation.includes('not contained by the open part'), true);
});

test('connection and evidence vocabulary preserve anchors, recorded facts, and contract confidence categories', () => {
  const connections = vocabularyForPlacement('file-connections');
  const evidence = explorerVocabulary.evidence;
  const confidence = explorerVocabulary.confidence;

  assert.deepEqual(connections.map((concept) => concept.id), ['file-connections', 'connection-anchor']);
  assert.equal(explorerVocabulary['file-connections'].explanation.includes('temporarily centered on one file'), true);
  assert.equal(explorerVocabulary['connection-anchor'].explanation.includes('Selecting another visible item inspects it without replacing the anchor'), true);
  assert.equal(evidence.friendlyTerm, 'How BunkerCode knows');
  assert.equal(evidence.technicalTerm, 'Evidence');
  assert.equal(evidence.explanation.includes('recorded facts'), true);
  assert.equal(evidence.explanation.includes('not from an AI-generated explanation'), true);
  assert.equal(explorerVocabulary['module-specifier'].explanation.includes('./analysis-result.js'), true);
  assert.equal(explorerVocabulary['module-specifier'].explanation.includes('ts-morph'), true);
  assert.equal(confidence.explanation.includes('exact, inferred, and uncertain'), true);
  assert.equal(confidence.explanation.includes('does not currently emit uncertain'), true);
  assert.equal(confidence.explanation.includes('not percentages'), true);
});

test('search can be restricted to files owned by the current package', () => {
  const source = createWorkspaceSource();
  const ownedFileIds = new Set(getFilesInWorkspacePackage(source.structure, workspacePackageId));

  assert.deepEqual(searchExplorerFiles(source.graph, 'index.ts', ownedFileIds).map((result) => result.nodeId), [
    'packages/analyzer-typescript/src/index.ts',
  ]);
  assert.deepEqual(createFileOverviewExplorerState().expandedNodeIds, new Set());
});
