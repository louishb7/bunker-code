import type { FileGraphNode, ProjectGraph, ProjectGraphEdge } from '@bunker-code/graph-engine';
import {
  orderedTerritoryChildren,
  type ExplorerTerritory,
  type ExplorerTerritoryProjection,
} from './explorer-territory-projection.js';

export type ExplorerSystemMapItem = ExplorerSystemMapTerritoryItem | ExplorerSystemMapDirectFileItem;

export interface ExplorerSystemMapTerritoryItem {
  id: string;
  kind: 'territory';
  label: string;
  territory: ExplorerTerritory;
}

export interface ExplorerSystemMapDirectFileItem {
  id: string;
  kind: 'file';
  label: string;
  file: FileGraphNode;
}

export interface ExplorerSystemMapRelation {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  observedDependencyCount: number;
  fileEdges: ProjectGraphEdge[];
}

export type ExplorerSystemMapProjection =
  | {
    status: 'ready';
    sourceTerritory: ExplorerTerritory;
    items: ExplorerSystemMapItem[];
    relations: ExplorerSystemMapRelation[];
  }
  | {
    status: 'source-territory-unavailable';
    requestedStructuralPath: './src';
    items: [];
    relations: [];
  };

export function createExplorerSystemMapProjection(
  graph: ProjectGraph,
  territories: ExplorerTerritoryProjection,
): ExplorerSystemMapProjection {
  const sourceTerritory = [...territories.territoriesById.values()]
    .find((territory) => territory.normalizedStructuralPath === './src');

  if (!sourceTerritory) {
    return {
      status: 'source-territory-unavailable',
      requestedStructuralPath: './src',
      items: [],
      relations: [],
    };
  }

  const filesById = new Map(
    graph.nodes
      .filter((node): node is FileGraphNode => node.kind === 'file')
      .map((file) => [file.id, file] as const),
  );
  const itemIdByFileId = new Map<string, string>();
  const items = orderedTerritoryChildren(territories, sourceTerritory.id).map((child): ExplorerSystemMapItem => {
    if (child.kind === 'file') {
      const file = filesById.get(child.fileId);
      if (!file) throw new Error(`Analyzed file not found for System Map item: ${child.fileId}`);
      itemIdByFileId.set(file.id, file.id);
      return { id: file.id, kind: 'file', label: child.label, file };
    }

    const territory = territories.territoriesById.get(child.territoryId);
    if (!territory) throw new Error(`Territory not found for System Map item: ${child.territoryId}`);
    collectTerritoryFileIds(territories, territory.id, itemIdByFileId, territory.id);
    return { id: territory.id, kind: 'territory', label: territory.label, territory };
  });
  const relationsByPair = new Map<string, ProjectGraphEdge[]>();

  for (const edge of [...graph.edges].sort(compareFileEdges)) {
    const sourceItemId = itemIdByFileId.get(edge.sourceNodeId);
    const targetItemId = itemIdByFileId.get(edge.targetNodeId);
    if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) continue;

    const pair = `${sourceItemId}\u0000${targetItemId}`;
    const fileEdges = relationsByPair.get(pair) ?? [];
    fileEdges.push(edge);
    relationsByPair.set(pair, fileEdges);
  }

  const relations = [...relationsByPair.entries()]
    .map(([pair, fileEdges]): ExplorerSystemMapRelation => {
      const [sourceItemId, targetItemId] = pair.split('\u0000');
      if (!sourceItemId || !targetItemId) throw new Error(`Invalid System Map relation pair: ${pair}`);
      return {
        id: `system-map-relation:${sourceItemId}->${targetItemId}`,
        sourceItemId,
        targetItemId,
        observedDependencyCount: fileEdges.length,
        fileEdges,
      };
    })
    .sort(compareRelations);

  return { status: 'ready', sourceTerritory, items, relations };
}

function collectTerritoryFileIds(
  territories: ExplorerTerritoryProjection,
  territoryId: string,
  itemIdByFileId: Map<string, string>,
  itemId: string,
): void {
  for (const child of orderedTerritoryChildren(territories, territoryId)) {
    if (child.kind === 'file') {
      itemIdByFileId.set(child.fileId, itemId);
    } else {
      collectTerritoryFileIds(territories, child.territoryId, itemIdByFileId, itemId);
    }
  }
}

function compareFileEdges(left: ProjectGraphEdge, right: ProjectGraphEdge): number {
  return left.id.localeCompare(right.id);
}

function compareRelations(left: ExplorerSystemMapRelation, right: ExplorerSystemMapRelation): number {
  return left.sourceItemId.localeCompare(right.sourceItemId)
    || left.targetItemId.localeCompare(right.targetItemId)
    || left.id.localeCompare(right.id);
}
