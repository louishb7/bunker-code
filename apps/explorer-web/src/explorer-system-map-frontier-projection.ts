import type { ProjectGraph, ProjectGraphEdge } from '@bunker-code/graph-engine';
import type {
  ExplorerSystemMapGeography,
  ExplorerSystemMapLandmark,
  ExplorerSystemMapRegion,
} from './explorer-system-map-geography.js';

export type ExplorerSystemMapFrontierItem =
  | { id: string; kind: 'region'; label: string; region: ExplorerSystemMapRegion }
  | { id: string; kind: 'file'; label: string; fileId: string };

export interface ExplorerSystemMapFrontierRelation {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  observedDependencyCount: number;
  fileEdges: ProjectGraphEdge[];
}

export interface ExplorerSystemMapInternalLandmarkDependencies {
  itemId: string;
  fileEdges: ProjectGraphEdge[];
}

export interface ExplorerSystemMapBoundaryCrossingDependency {
  id: string;
  direction: 'outgoing' | 'incoming';
  itemId: string;
  outsideFileId: string;
  edge: ProjectGraphEdge;
}

export interface ExplorerSystemMapFrontierProjection {
  boundary: ExplorerSystemMapRegion;
  frontier: ExplorerSystemMapLandmark[];
  items: ExplorerSystemMapFrontierItem[];
  fileOwnershipById: ReadonlyMap<string, string>;
  relations: ExplorerSystemMapFrontierRelation[];
  internalDependenciesWithinLandmarks: ExplorerSystemMapInternalLandmarkDependencies[];
  boundaryCrossingInternalDependencies: ExplorerSystemMapBoundaryCrossingDependency[];
}

export function createExplorerSystemMapFrontierProjection(
  geography: ExplorerSystemMapGeography,
  graph: ProjectGraph,
  frontier: readonly ExplorerSystemMapLandmark[] = geography.initialFrontier,
): ExplorerSystemMapFrontierProjection {
  const boundary = geography.regionsById.get(geography.boundaryRegionId);
  if (!boundary) throw new Error(`System Map boundary region not found: ${geography.boundaryRegionId}`);

  const orderedFrontier = [...frontier].sort(compareLandmarks);
  const items = orderedFrontier.map((landmark) => itemForLandmark(landmark, geography));
  const fileOwnershipById = createFileOwnership(boundary, items);
  const relationsByPair = new Map<string, ProjectGraphEdge[]>();
  const withinByItemId = new Map<string, ProjectGraphEdge[]>();
  const boundaryCrossingInternalDependencies: ExplorerSystemMapBoundaryCrossingDependency[] = [];

  for (const edge of [...graph.edges].sort(compareFileEdges)) {
    if (edge.dependencyKind !== 'internal') continue;
    const sourceItemId = fileOwnershipById.get(edge.sourceNodeId);
    const targetItemId = fileOwnershipById.get(edge.targetNodeId);

    if (sourceItemId && targetItemId) {
      if (sourceItemId === targetItemId) {
        const fileEdges = withinByItemId.get(sourceItemId) ?? [];
        fileEdges.push(edge);
        withinByItemId.set(sourceItemId, fileEdges);
        continue;
      }

      const pair = `${sourceItemId}\u0000${targetItemId}`;
      const fileEdges = relationsByPair.get(pair) ?? [];
      fileEdges.push(edge);
      relationsByPair.set(pair, fileEdges);
      continue;
    }

    if (sourceItemId || targetItemId) {
      const itemId = sourceItemId ?? targetItemId;
      if (!itemId) throw new Error(`Internal dependency has no represented landmark: ${edge.id}`);
      boundaryCrossingInternalDependencies.push({
        id: `system-map-boundary-crossing:${edge.id}`,
        direction: sourceItemId ? 'outgoing' : 'incoming',
        itemId,
        outsideFileId: sourceItemId ? edge.targetNodeId : edge.sourceNodeId,
        edge,
      });
    }
  }

  return {
    boundary,
    frontier: orderedFrontier,
    items,
    fileOwnershipById,
    relations: [...relationsByPair.entries()]
      .map(([pair, fileEdges]) => relationForPair(pair, fileEdges))
      .sort(compareRelations),
    internalDependenciesWithinLandmarks: [...withinByItemId.entries()]
      .map(([itemId, fileEdges]) => ({ itemId, fileEdges: [...fileEdges].sort(compareFileEdges) }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId)),
    boundaryCrossingInternalDependencies: boundaryCrossingInternalDependencies.sort(compareBoundaryCrossings),
  };
}

function itemForLandmark(
  landmark: ExplorerSystemMapLandmark,
  geography: ExplorerSystemMapGeography,
): ExplorerSystemMapFrontierItem {
  if (landmark.kind === 'file') {
    return {
      id: landmark.id,
      kind: 'file',
      label: pathSegment(landmark.fileId),
      fileId: landmark.fileId,
    };
  }

  const region = geography.regionsById.get(landmark.regionId);
  if (!region) throw new Error(`System Map landmark region not found: ${landmark.regionId}`);
  return {
    id: landmark.id,
    kind: 'region',
    label: region.workspacePackage?.name ?? pathSegment(region.rootPath),
    region,
  };
}

function pathSegment(structuralPath: string): string {
  const segments = structuralPath.split('/').filter(Boolean);
  return segments.at(-1) ?? structuralPath;
}

function createFileOwnership(
  boundary: ExplorerSystemMapRegion,
  items: readonly ExplorerSystemMapFrontierItem[],
): Map<string, string> {
  const ownershipByFileId = new Map<string, string>();

  for (const item of items) {
    const fileIds = item.kind === 'file' ? [item.fileId] : item.region.descendantFileIds;
    for (const fileId of fileIds) {
      const existingItemId = ownershipByFileId.get(fileId);
      if (existingItemId) {
        throw new Error(`System Map file belongs to multiple landmarks: ${fileId}`);
      }
      ownershipByFileId.set(fileId, item.id);
    }
  }

  const boundaryFileIds = new Set(boundary.descendantFileIds);
  for (const fileId of ownershipByFileId.keys()) {
    if (!boundaryFileIds.has(fileId)) {
      throw new Error(`System Map landmark file is outside the represented boundary: ${fileId}`);
    }
  }
  for (const fileId of boundaryFileIds) {
    if (!ownershipByFileId.has(fileId)) {
      throw new Error(`System Map boundary file has no visible landmark: ${fileId}`);
    }
  }

  return new Map([...ownershipByFileId.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function relationForPair(pair: string, fileEdges: readonly ProjectGraphEdge[]): ExplorerSystemMapFrontierRelation {
  const [sourceItemId, targetItemId] = pair.split('\u0000');
  if (!sourceItemId || !targetItemId) throw new Error(`Invalid System Map landmark relation pair: ${pair}`);
  const orderedFileEdges = [...fileEdges].sort(compareFileEdges);
  return {
    id: `system-map-frontier-relation:${sourceItemId}->${targetItemId}`,
    sourceItemId,
    targetItemId,
    observedDependencyCount: orderedFileEdges.length,
    fileEdges: orderedFileEdges,
  };
}

function compareLandmarks(left: ExplorerSystemMapLandmark, right: ExplorerSystemMapLandmark): number {
  return left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind);
}

function compareFileEdges(left: ProjectGraphEdge, right: ProjectGraphEdge): number {
  return left.id.localeCompare(right.id);
}

function compareRelations(left: ExplorerSystemMapFrontierRelation, right: ExplorerSystemMapFrontierRelation): number {
  return left.sourceItemId.localeCompare(right.sourceItemId)
    || left.targetItemId.localeCompare(right.targetItemId)
    || left.id.localeCompare(right.id);
}

function compareBoundaryCrossings(
  left: ExplorerSystemMapBoundaryCrossingDependency,
  right: ExplorerSystemMapBoundaryCrossingDependency,
): number {
  return left.direction.localeCompare(right.direction)
    || left.itemId.localeCompare(right.itemId)
    || left.outsideFileId.localeCompare(right.outsideFileId)
    || left.edge.id.localeCompare(right.edge.id);
}
