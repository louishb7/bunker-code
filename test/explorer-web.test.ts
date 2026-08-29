import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject, analyzeTypeScriptTarget } from '../packages/analyzer-typescript/src/index.js';
import { buildProjectGraph, buildProjectStructure } from '../packages/graph-engine/src/index.js';
import { createExplorerAttention } from '../apps/explorer-web/src/explorer-attention.js';
import { createExplorerOrientation } from '../apps/explorer-web/src/explorer-orientation.js';
import { createExplorerProjection } from '../apps/explorer-web/src/explorer-projection.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import { resolveExplorerSearchDestination } from '../apps/explorer-web/src/explorer-search.js';
import {
  createInitialExplorerLocation,
  focusExplorerFile,
  navigateToDestination,
  navigateToTerritory,
  selectExplorerItem,
} from '../apps/explorer-web/src/explorer-state.js';
import {
  createExplorerTerritoryProjection,
  orderedTerritoryChildren,
  parentExplorerTerritory,
} from '../apps/explorer-web/src/explorer-territory-projection.js';

function workspaceSource() {
  const analysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const territories = createExplorerTerritoryProjection(
    structure,
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  );

  return { graph, structure, territories };
}

test('runtime requires ResponsibilityAnalysisResult but keeps it outside territory projection', () => {
  const target = analyzeTypeScriptTarget(path.resolve('fixtures/simple-import'));
  const snapshot = { analysis: target.analysis, responsibilities: target.responsibilities, projectLabel: 'fixture' };
  const runtime = createExplorerRuntime(snapshot);

  assert.equal(runtime.kind, 'ready');
  if (runtime.kind !== 'ready') return;
  assert.deepEqual(runtime.responsibilities, target.responsibilities);

  const territories = createExplorerTerritoryProjection(
    runtime.structure,
    runtime.graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  );
  const projection = createExplorerProjection({ graph: runtime.graph, structure: runtime.structure, territories }, createInitialExplorerLocation(territories));
  assert.equal(projection.nodes.some((node) => node.kind === 'responsibility'), false);
});

test('root projection contains direct factual territory children in canonical order', () => {
  const source = workspaceSource();
  const location = createInitialExplorerLocation(source.territories);
  const projection = createExplorerProjection(source, location);
  const expected = orderedTerritoryChildren(source.territories, null);

  assert.equal(location.currentTerritoryId, null);
  assert.equal(projection.mode, 'root');
  assert.deepEqual(projection.nodes.map((node) => node.id), expected.map((child) => child.kind === 'territory' ? child.territoryId : child.fileId));
  assert.equal(projection.nodes.every((node) => node.kind === 'territory' || node.kind === 'file'), true);
  assert.equal(projection.nodes.some((node) => node.kind === 'workspace-package'), false);
});

test('workspace package and directory territories use the same direct-child composition', () => {
  const source = workspaceSource();
  const packageId = 'workspace-package:packages/library';
  const directoryId = 'directory:apps/application/src';
  const packageTerritory = source.territories.territoriesById.get(packageId);
  const directoryTerritory = source.territories.territoriesById.get(directoryId);
  assert.ok(packageTerritory);
  assert.ok(directoryTerritory);
  if (!packageTerritory || !directoryTerritory) return;

  for (const territory of [packageTerritory, directoryTerritory]) {
    const location = navigateToTerritory(createInitialExplorerLocation(source.territories), territory.id, territory.structuralPath);
    const projection = createExplorerProjection(source, location);
    const expected = orderedTerritoryChildren(source.territories, territory.id);

    assert.equal(projection.mode, 'territory');
    assert.deepEqual(projection.nodes.map((node) => node.id), expected.map((child) => child.kind === 'territory' ? child.territoryId : child.fileId));
  }
});

test('workspace package Territory retains factual structural evidence without a special projection mode', () => {
  const source = workspaceSource();
  const territory = source.territories.territoriesById.get('workspace-package:packages/library');

  assert.equal(territory?.kind, 'workspace-package');
  assert.deepEqual(territory?.evidence, [
    { kind: 'workspace-configuration', path: 'pnpm-workspace.yaml' },
    { kind: 'workspace-pattern', pattern: 'packages/*' },
    { kind: 'package-manifest', path: 'packages/library/package.json' },
  ]);
});

test('territory navigation resets transients and Back resolves the structural parent', () => {
  const source = workspaceSource();
  const territory = source.territories.territoriesById.get('directory:apps/application/src');
  assert.ok(territory);
  if (!territory) return;
  const location = focusExplorerFile(selectExplorerItem(createInitialExplorerLocation(source.territories), 'apps/application/src/main.ts'), 'apps/application/src/main.ts');
  const entered = navigateToTerritory(location, territory.id, territory.structuralPath);
  const orientation = createExplorerOrientation(entered, source.territories, 'fixture', source.graph);
  const parent = parentExplorerTerritory(source.territories, territory.id);

  assert.equal(entered.selectedItemId, null);
  assert.equal(entered.focusedFileId, null);
  assert.deepEqual(entered.expandedItemIds, new Set());
  assert.ok(parent);
  if (!parent) return;
  assert.deepEqual(orientation.backAction?.destination, { territoryId: parent.id, structuralPath: parent.structuralPath });
});

test('search resolves the deepest factual territory and selects its file', () => {
  const source = workspaceSource();
  const destination = resolveExplorerSearchDestination({
    nodeId: 'packages/library/src/index.ts',
    fileName: 'index.ts',
    path: 'packages/library/src/index.ts',
  }, source.territories);

  assert.deepEqual(destination, {
    territoryId: 'directory:packages/library/src',
    structuralPath: ['.', 'packages', 'library', 'src'],
    itemId: 'packages/library/src/index.ts',
  });
  assert.ok(destination);
  if (!destination) return;
  const location = navigateToDestination(createInitialExplorerLocation(source.territories), destination);
  assert.equal(location.currentTerritoryId, destination.territoryId);
  assert.equal(location.selectedItemId, destination.itemId);
});

test('focused files retain direct factual relationship context and attention priority', () => {
  const source = workspaceSource();
  const territory = source.territories.territoriesById.get('directory:apps/application/src');
  assert.ok(territory);
  if (!territory) return;
  const focusedFileId = 'apps/application/src/main.ts';
  const location = focusExplorerFile(
    navigateToTerritory(createInitialExplorerLocation(source.territories), territory.id, territory.structuralPath),
    focusedFileId,
  );
  const projection = createExplorerProjection(source, location);
  const attention = createExplorerAttention(projection, location);

  assert.equal(projection.mode, 'focus');
  assert.equal(attention.nodes.get(focusedFileId)?.role, 'anchor');
  assert.equal([...attention.nodes.values()].some((node) => node.role === 'direct'), true);
});

test('stale territory navigation fails explicitly', () => {
  const source = workspaceSource();
  const location = navigateToTerritory(createInitialExplorerLocation(source.territories), 'directory:missing', ['.', 'missing']);

  assert.throws(() => createExplorerProjection(source, location), /Territory not found/);
});

test('generated snapshot remains a valid responsibility-aware Explorer input', () => {
  const snapshot: unknown = JSON.parse(readFileSync('apps/explorer-web/src/generated/analyzer-typescript.snapshot.json', 'utf8'));
  assert.equal(createExplorerRuntime(snapshot).kind, 'ready');
});
