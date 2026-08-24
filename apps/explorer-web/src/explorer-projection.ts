import {
  getDependencies,
  getDependents,
  getFilesInWorkspacePackage,
  getWorkspacePackage,
  getWorkspacePackageForFile,
} from '@bunker-code/graph-engine';
import type {
  ExternalGraphNode,
  FileGraphNode,
  PackageDependency,
  ProjectGraph,
  ProjectGraphEdge,
  ProjectStructure,
} from '@bunker-code/graph-engine';
import type { WorkspacePackage } from '@bunker-code/contracts';
import type { ExplorerState, FileOverviewExplorerState, WorkspacePackageExplorerState } from './explorer-state.js';

export interface ExplorerSource {
  graph: ProjectGraph;
  structure: ProjectStructure;
  packageDependencies: PackageDependency[];
}

export type ExplorerProjectionNode = ExplorerFileProjectionNode | ExplorerExternalProjectionNode | ExplorerWorkspacePackageProjectionNode;

export interface ExplorerFileProjectionNode extends FileGraphNode {
  contextualWorkspacePackage?: WorkspacePackage;
}

export interface ExplorerExternalProjectionNode extends ExternalGraphNode {}

export interface ExplorerWorkspacePackageProjectionNode {
  id: string;
  kind: 'workspace-package';
  workspacePackage: WorkspacePackage;
  fileCount: number;
  filesystemGroup?: string;
}

export type ExplorerProjectionEdge = ExplorerFileDependencyEdge | ExplorerPackageDependencyEdge;

export interface ExplorerFileDependencyEdge {
  id: string;
  kind: 'file-dependency';
  sourceNodeId: string;
  targetNodeId: string;
  relation: ProjectGraphEdge;
}

export interface ExplorerPackageDependencyEdge {
  id: string;
  kind: 'package-dependency';
  sourceNodeId: string;
  targetNodeId: string;
  relation: PackageDependency;
}

export interface ExplorerProjection {
  mode: 'system' | 'overview' | 'focus';
  nodes: ExplorerProjectionNode[];
  edges: ExplorerProjectionEdge[];
  visibleNodeIds: ReadonlySet<string>;
}

/** Derives either the declared-workspace system map or the existing file-level map. */
export function createExplorerProjection(source: ExplorerSource, state: ExplorerState): ExplorerProjection {
  if (state.scope === 'system') {
    return systemProjection(source);
  }

  if (state.scope === 'workspace-package') {
    return workspacePackageProjection(source, state);
  }

  return fileProjection(source, state, new Set(
    source.graph.nodes.filter((node): node is FileGraphNode => node.kind === 'file').map((node) => node.id),
  ));
}

function systemProjection(source: ExplorerSource): ExplorerProjection {
  const groupCounts = filesystemGroupCounts(source.structure.packages);
  const nodes = source.structure.packages.map((workspacePackage) => ({
    id: workspacePackage.id,
    kind: 'workspace-package' as const,
    workspacePackage,
    fileCount: getFilesInWorkspacePackage(source.structure, workspacePackage.id).length,
    filesystemGroup: filesystemGroupForPackage(workspacePackage, groupCounts),
  }));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));

  return {
    mode: 'system',
    visibleNodeIds,
    nodes,
    edges: source.packageDependencies.map((relation) => ({
      id: relation.id,
      kind: 'package-dependency' as const,
      sourceNodeId: relation.sourcePackageId,
      targetNodeId: relation.targetPackageId,
      relation,
    })),
  };
}

function workspacePackageProjection(source: ExplorerSource, state: WorkspacePackageExplorerState): ExplorerProjection {
  if (!getWorkspacePackage(source.structure, state.packageId)) {
    throw new Error(`Workspace package not found in project structure: ${state.packageId}`);
  }

  const ownedFileIds = new Set(getFilesInWorkspacePackage(source.structure, state.packageId));
  return fileProjection(source, state, ownedFileIds);
}

function fileProjection(
  source: ExplorerSource,
  state: FileOverviewExplorerState | WorkspacePackageExplorerState,
  ownedFileIds: ReadonlySet<string>,
): ExplorerProjection {
  if (!state.focusedNodeId) {
    const visibleNodeIds = new Set(ownedFileIds);

    if (state.scope === 'workspace-package') {
      addCrossPackageFileContext(source, state.packageId, visibleNodeIds);
    }

    return projectionFromVisibleNodeIds(source, 'overview', visibleNodeIds, state.scope === 'workspace-package' ? state.packageId : null);
  }

  if (!ownedFileIds.has(state.focusedNodeId)) {
    throw new Error(`Focus target file is outside the current file scope: ${state.focusedNodeId}`);
  }

  const visibleNodeIds = new Set<string>([state.focusedNodeId]);
  addDirectContext(source.graph, state.focusedNodeId, visibleNodeIds);

  for (const expandedNodeId of [...state.expandedNodeIds].sort()) {
    if (ownedFileIds.has(expandedNodeId)) {
      addDirectContext(source.graph, expandedNodeId, visibleNodeIds);
    }
  }

  return projectionFromVisibleNodeIds(
    source,
    'focus',
    visibleNodeIds,
    state.scope === 'workspace-package' ? state.packageId : null,
  );
}

function addCrossPackageFileContext(
  source: ExplorerSource,
  packageId: string,
  visibleNodeIds: Set<string>,
): void {
  for (const edge of source.graph.edges) {
    const sourcePackage = getWorkspacePackageForFile(source.structure, edge.sourceNodeId);
    const targetPackage = getWorkspacePackageForFile(source.structure, edge.targetNodeId);

    if (sourcePackage?.id === packageId && targetPackage && targetPackage.id !== packageId) {
      visibleNodeIds.add(edge.targetNodeId);
    }

    if (targetPackage?.id === packageId && sourcePackage && sourcePackage.id !== packageId) {
      visibleNodeIds.add(edge.sourceNodeId);
    }
  }
}

function addDirectContext(graph: ProjectGraph, nodeId: string, visibleNodeIds: Set<string>): void {
  for (const edge of getDependencies(graph, nodeId)) {
    visibleNodeIds.add(edge.targetNodeId);
  }

  for (const edge of getDependents(graph, nodeId)) {
    visibleNodeIds.add(edge.sourceNodeId);
  }
}

function projectionFromVisibleNodeIds(
  source: ExplorerSource,
  mode: 'overview' | 'focus',
  visibleNodeIds: ReadonlySet<string>,
  currentPackageId: string | null,
): ExplorerProjection {
  return {
    mode,
    visibleNodeIds,
    nodes: source.graph.nodes
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => node.kind === 'file'
        ? contextualizeFileNode(source.structure, node, currentPackageId)
        : node),
    edges: source.graph.edges
      .filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
      .map((relation) => ({
        id: relation.id,
        kind: 'file-dependency' as const,
        sourceNodeId: relation.sourceNodeId,
        targetNodeId: relation.targetNodeId,
        relation,
      })),
  };
}

function contextualizeFileNode(
  structure: ProjectStructure,
  node: FileGraphNode,
  currentPackageId: string | null,
): ExplorerFileProjectionNode {
  const workspacePackage = getWorkspacePackageForFile(structure, node.id);

  return currentPackageId && workspacePackage?.id !== currentPackageId
    ? { ...node, contextualWorkspacePackage: workspacePackage }
    : node;
}

function filesystemGroupCounts(packages: WorkspacePackage[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const workspacePackage of packages) {
    const group = workspacePackage.rootPath.split('/')[0];

    if (group) {
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  }

  return counts;
}

function filesystemGroupForPackage(
  workspacePackage: WorkspacePackage,
  groupCounts: ReadonlyMap<string, number>,
): string | undefined {
  const group = workspacePackage.rootPath.split('/')[0];
  const count = group ? groupCounts.get(group) : undefined;
  return group && count !== undefined && count > 1 ? group : undefined;
}
