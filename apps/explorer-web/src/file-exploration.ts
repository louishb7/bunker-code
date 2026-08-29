import { getDependencies, getDependents } from '@bunker-code/graph-engine';
import type { ProjectGraph, ProjectGraphEdge, ProjectGraphNode } from '@bunker-code/graph-engine';
import { fileNameFromPath } from './explorer-search.js';
import type { ExplorerLocation } from './explorer-state.js';

export type FileExplorationKind = 'owned-file' | 'contextual-file' | 'project-file' | 'external-module';

export interface FileExplorationRelation {
  relatedNodeId: string;
  relatedLabel: string;
  sourceNodeId: string;
  sourceLabel: string;
  targetNodeId: string;
  targetLabel: string;
  occurrences: ProjectGraphEdge[];
}

export interface FileExploration {
  kind: FileExplorationKind;
  presentationLabel: string;
  contextLabel: string;
  contextExplanation?: string;
  location?: string;
  technicalIdentity: string;
  technicalKind: ProjectGraphNode['kind'];
  uses: FileExplorationRelation[];
  usedBy: FileExplorationRelation[];
  usesEmptyMessage: string;
  usedByEmptyMessage: string;
  rawUsesCount: number;
  rawUsedByCount: number;
  canFocus: boolean;
  canExpand: boolean;
  actionUnavailableExplanation?: string;
  anchor?: { nodeId: string; label: string; isSelected: boolean };
}

export function createFileExploration(
  node: ProjectGraphNode,
  graph: ProjectGraph,
  location: ExplorerLocation,
  visibleNodeIds: ReadonlySet<string>,
  ownedFileIds: ReadonlySet<string>,
): FileExploration {
  const nodesById = new Map(graph.nodes.map((item) => [item.id, item] as const));
  const owned = node.kind === 'file' && ownedFileIds.has(node.id);
  const anchor = location.focusedFileId ? nodesById.get(location.focusedFileId) : undefined;
  const canFocus = owned && location.focusedFileId !== node.id;
  const canExpand = owned && location.focusedFileId !== null && !location.expandedItemIds.has(node.id)
    && [...getDependencies(graph, node.id), ...getDependents(graph, node.id)].some((edge) => !visibleNodeIds.has(edge.sourceNodeId) || !visibleNodeIds.has(edge.targetNodeId));

  return {
    ...fileIdentity(node, owned),
    uses: groupRelationships(getDependencies(graph, node.id), 'uses', nodesById),
    usedBy: groupRelationships(getDependents(graph, node.id), 'used-by', nodesById),
    usesEmptyMessage: 'No detected outgoing connections.',
    usedByEmptyMessage: 'No detected incoming connections.',
    rawUsesCount: getDependencies(graph, node.id).length,
    rawUsedByCount: getDependents(graph, node.id).length,
    canFocus,
    canExpand,
    actionUnavailableExplanation: canFocus || canExpand ? undefined : node.kind === 'external'
      ? 'This module can be inspected here, but cannot anchor a file-connections view.'
      : location.focusedFileId === node.id ? 'This file is already the connection anchor.' : 'This file is context for the current file focus.',
    anchor: anchor ? { nodeId: anchor.id, label: graphNodeLabel(anchor), isSelected: anchor.id === node.id } : undefined,
  };
}

function fileIdentity(node: ProjectGraphNode, owned: boolean): Pick<FileExploration, 'kind' | 'presentationLabel' | 'contextLabel' | 'contextExplanation' | 'location' | 'technicalIdentity' | 'technicalKind'> {
  if (node.kind === 'external') return { kind: 'external-module', presentationLabel: node.moduleSpecifier, contextLabel: 'Outside this analyzed system', technicalIdentity: node.id, technicalKind: node.kind };
  return {
    kind: owned ? 'owned-file' : 'contextual-file',
    presentationLabel: fileNameFromPath(node.path),
    contextLabel: owned ? 'File in this territory' : 'Relationship context',
    contextExplanation: owned ? undefined : 'This file is shown because it has a direct relationship with the focused file.',
    location: node.path,
    technicalIdentity: node.id,
    technicalKind: node.kind,
  };
}

function groupRelationships(edges: ProjectGraphEdge[], direction: 'uses' | 'used-by', nodesById: ReadonlyMap<string, ProjectGraphNode>): FileExplorationRelation[] {
  const groups = new Map<string, ProjectGraphEdge[]>();
  for (const edge of edges) {
    const id = direction === 'uses' ? edge.targetNodeId : edge.sourceNodeId;
    groups.set(id, [...(groups.get(id) ?? []), edge]);
  }
  return [...groups.entries()].map(([relatedNodeId, occurrences]) => {
    const first = occurrences[0];
    if (!first) throw new Error(`File relationship group cannot be empty: ${relatedNodeId}`);
    const related = nodesById.get(relatedNodeId);
    const source = nodesById.get(first.sourceNodeId);
    const target = nodesById.get(first.targetNodeId);
    return {
      relatedNodeId,
      relatedLabel: related ? graphNodeLabel(related) : relatedNodeId,
      sourceNodeId: first.sourceNodeId,
      sourceLabel: source ? graphNodeLabel(source) : first.sourceNodeId,
      targetNodeId: first.targetNodeId,
      targetLabel: target ? graphNodeLabel(target) : first.targetNodeId,
      occurrences,
    };
  });
}

function graphNodeLabel(node: ProjectGraphNode): string {
  return node.kind === 'file' ? fileNameFromPath(node.path) : node.moduleSpecifier;
}
