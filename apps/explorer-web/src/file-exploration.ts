import {
  getDependencies,
  getDependents,
  getFilesInWorkspacePackage,
  getWorkspacePackage,
  getWorkspacePackageForFile,
} from '@bunker-code/graph-engine';
import type {
  ProjectGraph,
  ProjectGraphEdge,
  ProjectGraphNode,
  ProjectStructure,
} from '@bunker-code/graph-engine';
import { workspacePackagePresentationLabels } from './explorer-projection.js';
import { fileNameFromPath } from './explorer-search.js';
import type { ExplorerLocation } from './explorer-state.js';

export type FileExplorationKind = 'owned-file' | 'contextual-file' | 'project-file' | 'external-module';

export interface FileExplorationRelation {
  relatedNodeId: string;
  relatedLabel: string;
  relatedContextLabel: string;
  sourceNodeId: string;
  sourceLabel: string;
  targetNodeId: string;
  targetLabel: string;
  occurrences: ProjectGraphEdge[];
}

export interface FileExplorationAnchor {
  nodeId: string;
  label: string;
  isSelected: boolean;
}

export interface FileExploration {
  kind: FileExplorationKind;
  presentationLabel: string;
  contextLabel: string;
  contextExplanation?: string;
  ownerPartLabel?: string;
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
  anchor?: FileExplorationAnchor;
}

export function createFileExploration(
  node: ProjectGraphNode,
  graph: ProjectGraph,
  structure: ProjectStructure,
  location: ExplorerLocation,
  visibleNodeIds: ReadonlySet<string>,
): FileExploration {
  const nodesById = new Map(graph.nodes.map((graphNode) => [graphNode.id, graphNode] as const));
  const dependencies = getDependencies(graph, node.id);
  const dependents = getDependents(graph, node.id);
  const packageLabels = workspacePackagePresentationLabels(structure.packages);
  const ownership = fileOwnership(node, structure, location, packageLabels);
  const currentPackageId = location.currentTerritoryId && getWorkspacePackage(structure, location.currentTerritoryId)
    ? location.currentTerritoryId
    : null;
  const ownedFileIds = currentPackageId
    ? new Set(getFilesInWorkspacePackage(structure, currentPackageId))
    : undefined;
  const isOwnedByScope = node.kind === 'file' && (!ownedFileIds || ownedFileIds.has(node.id));
  const anchorNode = location.focusedFileId ? nodesById.get(location.focusedFileId) : undefined;
  const canFocus = isOwnedByScope && location.focusedFileId !== node.id;
  const canExpand = isOwnedByScope
    && location.focusedFileId !== null
    && visibleNodeIds.has(node.id)
    && !location.expandedItemIds.has(node.id)
    && hasHiddenDirectContext(graph, node.id, visibleNodeIds);

  return {
    ...ownership,
    uses: groupRelationships(dependencies, 'uses', nodesById, structure, location, packageLabels),
    usedBy: groupRelationships(dependents, 'used-by', nodesById, structure, location, packageLabels),
    usesEmptyMessage: node.kind === 'external'
      ? 'No detected outgoing connections from this external module.'
      : 'No detected outgoing connections.',
    usedByEmptyMessage: node.kind === 'external'
      ? 'No detected analyzed files use this external module.'
      : 'No detected files use this item.',
    rawUsesCount: dependencies.length,
    rawUsedByCount: dependents.length,
    canFocus,
    canExpand,
    actionUnavailableExplanation: canFocus || canExpand
      ? undefined
      : node.kind === 'external'
        ? 'This module can be inspected here, but it is not an internal file that can anchor a file-connections view.'
        : !isOwnedByScope
          ? 'This file remains context for the current part, so it cannot anchor a file-connections view here.'
          : location.focusedFileId === node.id
            ? 'This file is already the connection anchor.'
            : undefined,
    anchor: anchorNode ? {
      nodeId: anchorNode.id,
      label: graphNodeLabel(anchorNode),
      isSelected: anchorNode.id === node.id,
    } : undefined,
  };
}

function fileOwnership(
  node: ProjectGraphNode,
  structure: ProjectStructure,
  location: ExplorerLocation,
  packageLabels: ReadonlyMap<string, string>,
): Pick<FileExploration,
  'kind' | 'presentationLabel' | 'contextLabel' | 'contextExplanation' | 'ownerPartLabel' | 'location' | 'technicalIdentity' | 'technicalKind'> {
  if (node.kind === 'external') {
    return {
      kind: 'external-module',
      presentationLabel: node.moduleSpecifier,
      contextLabel: 'Outside this analyzed system',
      contextExplanation: 'This destination is not an analyzed internal file. External module does not imply a remote service or a confirmed third-party package.',
      technicalIdentity: node.id,
      technicalKind: node.kind,
    };
  }

  const owner = getWorkspacePackageForFile(structure, node.id);

  const currentPackageId = location.currentTerritoryId && getWorkspacePackage(structure, location.currentTerritoryId)
    ? location.currentTerritoryId
    : null;

  if (!currentPackageId) {
    return {
      kind: 'project-file',
      presentationLabel: fileNameFromPath(node.path),
      contextLabel: 'Analyzed file',
      location: node.path,
      technicalIdentity: node.id,
      technicalKind: node.kind,
    };
  }

  const currentPart = getWorkspacePackage(structure, currentPackageId);
  const contextual = owner?.id !== currentPackageId;

  return {
    kind: contextual ? 'contextual-file' : 'owned-file',
    presentationLabel: fileNameFromPath(node.path),
    contextLabel: contextual
      ? owner ? 'From another part' : 'Outside this part'
      : 'File in this part',
    contextExplanation: contextual
      ? owner
        ? 'This file is shown because it connects to files in the part you are exploring.'
        : 'This analyzed file is shown because it connects to the part you are exploring, but it is not assigned to a detected part.'
      : undefined,
    ownerPartLabel: owner
      ? packageLabels.get(owner.id) ?? owner.name ?? owner.rootPath
      : contextual
        ? undefined
        : currentPart ? packageLabels.get(currentPart.id) ?? currentPart.name ?? currentPart.rootPath : undefined,
    location: node.path,
    technicalIdentity: node.id,
    technicalKind: node.kind,
  };
}

function groupRelationships(
  edges: ProjectGraphEdge[],
  direction: 'uses' | 'used-by',
  nodesById: ReadonlyMap<string, ProjectGraphNode>,
  structure: ProjectStructure,
  location: ExplorerLocation,
  packageLabels: ReadonlyMap<string, string>,
): FileExplorationRelation[] {
  const groups = new Map<string, ProjectGraphEdge[]>();

  for (const edge of edges) {
    const relatedNodeId = direction === 'uses' ? edge.targetNodeId : edge.sourceNodeId;
    const occurrences = groups.get(relatedNodeId);

    if (occurrences) {
      occurrences.push(edge);
    } else {
      groups.set(relatedNodeId, [edge]);
    }
  }

  return [...groups.entries()].map(([relatedNodeId, occurrences]) => {
    const firstOccurrence = occurrences[0];

    if (!firstOccurrence) {
      throw new Error(`File relationship group cannot be empty: ${relatedNodeId}`);
    }

    const relatedNode = nodesById.get(relatedNodeId);
    const sourceNode = nodesById.get(firstOccurrence.sourceNodeId);
    const targetNode = nodesById.get(firstOccurrence.targetNodeId);

    return {
      relatedNodeId,
      relatedLabel: relatedNode ? graphNodeLabel(relatedNode) : relatedNodeId,
      relatedContextLabel: relatedNode
        ? relatedNodeContextLabel(relatedNode, structure, location, packageLabels)
        : 'Analytical item',
      sourceNodeId: firstOccurrence.sourceNodeId,
      sourceLabel: sourceNode ? graphNodeLabel(sourceNode) : firstOccurrence.sourceNodeId,
      targetNodeId: firstOccurrence.targetNodeId,
      targetLabel: targetNode ? graphNodeLabel(targetNode) : firstOccurrence.targetNodeId,
      occurrences,
    };
  });
}

function relatedNodeContextLabel(
  node: ProjectGraphNode,
  structure: ProjectStructure,
  location: ExplorerLocation,
  packageLabels: ReadonlyMap<string, string>,
): string {
  if (node.kind === 'external') {
    return 'Outside this analyzed system';
  }

  const currentPackageId = location.currentTerritoryId && getWorkspacePackage(structure, location.currentTerritoryId)
    ? location.currentTerritoryId
    : null;
  if (!currentPackageId) {
    return 'Analyzed file';
  }

  const owner = getWorkspacePackageForFile(structure, node.id);
  return owner?.id === currentPackageId
    ? 'File in this part'
    : owner
      ? `From ${packageLabels.get(owner.id) ?? owner.name ?? owner.rootPath}`
      : 'Outside this part';
}

function hasHiddenDirectContext(graph: ProjectGraph, nodeId: string, visibleNodeIds: ReadonlySet<string>): boolean {
  return [...getDependencies(graph, nodeId), ...getDependents(graph, nodeId)].some((edge) => (
    !visibleNodeIds.has(edge.sourceNodeId) || !visibleNodeIds.has(edge.targetNodeId)
  ));
}

function graphNodeLabel(node: ProjectGraphNode): string {
  return node.kind === 'file' ? fileNameFromPath(node.path) : node.moduleSpecifier;
}
