import { getDependencies, getDependents } from '@bunker-code/graph-engine';
import type {
  ExternalGraphNode,
  FileGraphNode,
  ProjectGraph,
  ProjectGraphEdge,
  ProjectStructure,
} from '@bunker-code/graph-engine';
import type { ExplorerLocation } from './explorer-state.js';
import {
  orderedTerritoryChildren,
  type ExplorerTerritory,
  type ExplorerTerritoryProjection,
} from './explorer-territory-projection.js';

export interface ExplorerSource {
  graph: ProjectGraph;
  structure: ProjectStructure;
  territories: ExplorerTerritoryProjection;
}

export type ExplorerProjectionNode = ExplorerFileProjectionNode | ExplorerExternalProjectionNode | ExplorerTerritoryProjectionNode;

export interface ExplorerFileProjectionNode extends FileGraphNode {
  scopeRole: 'owned' | 'contextual' | 'project';
}

export interface ExplorerExternalProjectionNode extends ExternalGraphNode {}

export interface ExplorerTerritoryProjectionNode {
  id: string;
  kind: 'territory';
  territory: ExplorerTerritory;
}

export interface ExplorerRootSummary {
  directTerritoryCount: number;
  analyzedFileCount: number;
}

export interface ExplorerFileDependencyEdge {
  id: string;
  kind: 'file-dependency';
  sourceNodeId: string;
  targetNodeId: string;
  relation: ProjectGraphEdge;
}

export type ExplorerProjectionEdge = ExplorerFileDependencyEdge;

export interface ExplorerProjection {
  mode: 'root' | 'territory' | 'focus';
  nodes: ExplorerProjectionNode[];
  edges: ExplorerProjectionEdge[];
  visibleNodeIds: ReadonlySet<string>;
  rootSummary?: ExplorerRootSummary;
}

export function createExplorerProjection(source: ExplorerSource, location: ExplorerLocation): ExplorerProjection {
  if (location.currentTerritoryId === null) {
    return territoryProjection(source, location, null);
  }

  const territory = source.territories.territoriesById.get(location.currentTerritoryId);
  if (!territory) {
    throw new Error(`Territory not found: ${location.currentTerritoryId}`);
  }

  if (location.focusedFileId === null) {
    return territoryProjection(source, location, territory.id);
  }

  const territoryFileIds = directFileIds(source.territories, territory.id);
  if (!territoryFileIds.has(location.focusedFileId)) {
    throw new Error(`Focus target file is outside the current territory: ${location.focusedFileId}`);
  }

  const visibleNodeIds = new Set<string>([location.focusedFileId]);
  addDirectContext(source.graph, location.focusedFileId, visibleNodeIds);
  for (const expandedNodeId of [...location.expandedItemIds].sort()) {
    if (territoryFileIds.has(expandedNodeId)) {
      addDirectContext(source.graph, expandedNodeId, visibleNodeIds);
    }
  }

  return fileProjection(source, visibleNodeIds, territoryFileIds, 'focus');
}

function territoryProjection(
  source: ExplorerSource,
  location: ExplorerLocation,
  territoryId: string | null,
): ExplorerProjection {
  const children = orderedTerritoryChildren(source.territories, territoryId);
  const nodes: ExplorerProjectionNode[] = [];
  const directFileIds = new Set<string>();

  for (const child of children) {
    if (child.kind === 'territory') {
      const territory = source.territories.territoriesById.get(child.territoryId);
      if (!territory) {
        throw new Error(`Territory not found: ${child.territoryId}`);
      }
      nodes.push({ id: territory.id, kind: 'territory', territory });
      continue;
    }

    const node = source.graph.nodes.find((candidate): candidate is FileGraphNode => candidate.kind === 'file' && candidate.id === child.fileId);
    if (!node) {
      throw new Error(`Analyzed file not found for territory child: ${child.fileId}`);
    }
    directFileIds.add(node.id);
    nodes.push({ ...node, scopeRole: territoryId === null ? 'project' : 'owned' });
  }

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = source.graph.edges
    .filter((edge) => directFileIds.has(edge.sourceNodeId) && directFileIds.has(edge.targetNodeId))
    .map((relation) => ({
      id: relation.id,
      kind: 'file-dependency' as const,
      sourceNodeId: relation.sourceNodeId,
      targetNodeId: relation.targetNodeId,
      relation,
    }));

  return {
    mode: territoryId === null ? 'root' : 'territory',
    nodes,
    edges,
    visibleNodeIds,
    rootSummary: territoryId === null ? {
      directTerritoryCount: source.territories.system.directChildTerritoryCount,
      analyzedFileCount: source.territories.system.analyzedFileCount,
    } : undefined,
  };
}

function fileProjection(
  source: ExplorerSource,
  visibleNodeIds: ReadonlySet<string>,
  directFileIds: ReadonlySet<string>,
  mode: 'focus',
): ExplorerProjection {
  const nodes = source.graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node): ExplorerProjectionNode => node.kind === 'file'
      ? { ...node, scopeRole: directFileIds.has(node.id) ? 'owned' : 'contextual' }
      : node);
  const edges = source.graph.edges
    .filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
    .map((relation) => ({
      id: relation.id,
      kind: 'file-dependency' as const,
      sourceNodeId: relation.sourceNodeId,
      targetNodeId: relation.targetNodeId,
      relation,
    }));

  return { mode, nodes, edges, visibleNodeIds };
}

function directFileIds(territories: ExplorerTerritoryProjection, territoryId: string): Set<string> {
  return new Set(orderedTerritoryChildren(territories, territoryId)
    .flatMap((child) => child.kind === 'file' ? [child.fileId] : []));
}

function addDirectContext(graph: ProjectGraph, nodeId: string, visibleNodeIds: Set<string>): void {
  for (const edge of getDependencies(graph, nodeId)) {
    visibleNodeIds.add(edge.targetNodeId);
  }
  for (const edge of getDependents(graph, nodeId)) {
    visibleNodeIds.add(edge.sourceNodeId);
  }
}
