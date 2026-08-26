import type { FileGraphNode, ProjectGraph } from '@bunker-code/graph-engine';
import type { ExplorerTerritoryProjection } from './explorer-territory-projection.js';
import type { ExplorerDestination } from './explorer-state.js';

export interface ExplorerSearchResult {
  nodeId: string;
  fileName: string;
  path: string;
}

export function searchExplorerFiles(
  graph: ProjectGraph,
  query: string,
  allowedNodeIds?: ReadonlySet<string>,
): ExplorerSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return graph.nodes
    .filter((node): node is FileGraphNode => node.kind === 'file' && (!allowedNodeIds || allowedNodeIds.has(node.id)))
    .map((node) => ({ nodeId: node.id, fileName: fileNameFromPath(node.path), path: node.path }))
    .filter((node) => (
      node.fileName.toLocaleLowerCase().includes(normalizedQuery)
      || node.path.toLocaleLowerCase().includes(normalizedQuery)
    ));
}

export function fileNameFromPath(path: string): string {
  return path.split('/').at(-1) ?? path;
}

export function resolveExplorerSearchDestination(
  result: ExplorerSearchResult,
  territories: ExplorerTerritoryProjection,
): ExplorerDestination | null {
  const filePath = ['.', ...result.path.split('/')];
  const owner = [...territories.territoriesById.values()]
    .filter((territory) => territory.kind !== 'system' && isStructuralAncestor(territory.structuralPath, filePath))
    .sort((left, right) => right.structuralPath.length - left.structuralPath.length || left.id.localeCompare(right.id))[0];

  if (!owner) {
    return null;
  }

  return {
    territoryId: owner.id,
    structuralPath: [...owner.structuralPath],
    itemId: result.nodeId,
  };
}

function isStructuralAncestor(ancestor: readonly string[], descendant: readonly string[]): boolean {
  return ancestor.length <= descendant.length && ancestor.every((segment, index) => segment === descendant[index]);
}
