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
import type { ExplorerLocation } from './explorer-state.js';

export interface ExplorerSource {
  graph: ProjectGraph;
  structure: ProjectStructure;
  packageDependencies: PackageDependency[];
}

export type ExplorerProjectionNode = ExplorerFileProjectionNode | ExplorerExternalProjectionNode | ExplorerWorkspacePackageProjectionNode;

export interface ExplorerFileProjectionNode extends FileGraphNode {
  scopeRole: 'owned' | 'contextual' | 'project';
  contextualWorkspacePackage?: WorkspacePackage;
  contextualPartLabel?: string;
}

export interface ExplorerExternalProjectionNode extends ExternalGraphNode {}

export interface ExplorerWorkspacePackageProjectionNode {
  id: string;
  kind: 'workspace-package';
  workspacePackage: WorkspacePackage;
  presentationLabel: string;
  technicalLabel: string;
  fileCount: number;
  usesCount: number;
  usedByCount: number;
  filesystemGroup: string;
}

export interface ExplorerFilesystemGroup {
  id: string;
  label: string;
  partLabels: string[];
}

export interface ExplorerSystemSummary {
  detectedPartCount: number;
  analyzedFileCount: number;
  filesystemGroups: ExplorerFilesystemGroup[];
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
  systemSummary?: ExplorerSystemSummary;
}

/** Derives either the declared-workspace system map or the existing file-level map. */
export function createExplorerProjection(source: ExplorerSource, location: ExplorerLocation): ExplorerProjection {
  if (!location.currentTerritoryId) {
    return systemProjection(source);
  }

  if (getWorkspacePackage(source.structure, location.currentTerritoryId)) {
    return workspacePackageProjection(source, location);
  }

  return fileProjection(source, location, new Set(
    source.graph.nodes.filter((node): node is FileGraphNode => node.kind === 'file').map((node) => node.id),
  ));
}

function systemProjection(source: ExplorerSource): ExplorerProjection {
  const presentationLabels = workspacePackagePresentationLabels(source.structure.packages);
  const usesCounts = new Map<string, number>();
  const usedByCounts = new Map<string, number>();

  for (const dependency of source.packageDependencies) {
    usesCounts.set(dependency.sourcePackageId, (usesCounts.get(dependency.sourcePackageId) ?? 0) + 1);
    usedByCounts.set(dependency.targetPackageId, (usedByCounts.get(dependency.targetPackageId) ?? 0) + 1);
  }

  const nodes = source.structure.packages.map((workspacePackage) => ({
    id: workspacePackage.id,
    kind: 'workspace-package' as const,
    workspacePackage,
    presentationLabel: presentationLabels.get(workspacePackage.id) ?? workspacePackage.rootPath,
    technicalLabel: workspacePackage.name ?? workspacePackage.rootPath,
    fileCount: getFilesInWorkspacePackage(source.structure, workspacePackage.id).length,
    usesCount: usesCounts.get(workspacePackage.id) ?? 0,
    usedByCount: usedByCounts.get(workspacePackage.id) ?? 0,
    filesystemGroup: filesystemGroupForPackage(workspacePackage),
  }));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));

  return {
    mode: 'system',
    visibleNodeIds,
    nodes,
    systemSummary: {
      detectedPartCount: nodes.length,
      analyzedFileCount: source.graph.nodes.filter((node) => node.kind === 'file').length,
      filesystemGroups: filesystemGroups(nodes),
    },
    edges: source.packageDependencies.map((relation) => ({
      id: relation.id,
      kind: 'package-dependency' as const,
      sourceNodeId: relation.sourcePackageId,
      targetNodeId: relation.targetPackageId,
      relation,
    })),
  };
}

function workspacePackageProjection(source: ExplorerSource, location: ExplorerLocation): ExplorerProjection {
  if (!location.currentTerritoryId || !getWorkspacePackage(source.structure, location.currentTerritoryId)) {
    throw new Error(`Workspace package not found in project structure: ${location.currentTerritoryId ?? 'root'}`);
  }

  const ownedFileIds = new Set(getFilesInWorkspacePackage(source.structure, location.currentTerritoryId));
  return fileProjection(source, location, ownedFileIds);
}

function fileProjection(
  source: ExplorerSource,
  location: ExplorerLocation,
  ownedFileIds: ReadonlySet<string>,
): ExplorerProjection {
  const currentPackageId = location.currentTerritoryId && getWorkspacePackage(source.structure, location.currentTerritoryId)
    ? location.currentTerritoryId
    : null;

  if (!location.focusedFileId) {
    const visibleNodeIds = new Set(ownedFileIds);

    if (currentPackageId) {
      addCrossPackageFileContext(source, currentPackageId, visibleNodeIds);
    }

    return projectionFromVisibleNodeIds(source, 'overview', visibleNodeIds, currentPackageId);
  }

  if (!ownedFileIds.has(location.focusedFileId)) {
    throw new Error(`Focus target file is outside the current territory: ${location.focusedFileId}`);
  }

  const visibleNodeIds = new Set<string>([location.focusedFileId]);
  addDirectContext(source.graph, location.focusedFileId, visibleNodeIds);

  for (const expandedNodeId of [...location.expandedItemIds].sort()) {
    if (ownedFileIds.has(expandedNodeId)) {
      addDirectContext(source.graph, expandedNodeId, visibleNodeIds);
    }
  }

  return projectionFromVisibleNodeIds(
    source,
    'focus',
    visibleNodeIds,
    currentPackageId,
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
  const packageLabels = workspacePackagePresentationLabels(source.structure.packages);

  return {
    mode,
    visibleNodeIds,
    nodes: source.graph.nodes
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => node.kind === 'file'
        ? contextualizeFileNode(source.structure, node, currentPackageId, packageLabels)
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
  packageLabels: ReadonlyMap<string, string>,
): ExplorerFileProjectionNode {
  const workspacePackage = getWorkspacePackageForFile(structure, node.id);

  if (!currentPackageId) {
    return { ...node, scopeRole: 'project' };
  }

  return workspacePackage?.id === currentPackageId
    ? { ...node, scopeRole: 'owned' }
    : {
      ...node,
      scopeRole: 'contextual',
      contextualWorkspacePackage: workspacePackage,
      contextualPartLabel: workspacePackage
        ? packageLabels.get(workspacePackage.id) ?? workspacePackage.name ?? workspacePackage.rootPath
        : undefined,
    };
}

export function workspacePackagePresentationLabels(packages: WorkspacePackage[]): ReadonlyMap<string, string> {
  const candidates = packages.map((workspacePackage) => ({
    workspacePackage,
    candidate: packageLabelCandidate(workspacePackage),
  }));
  const candidateCounts = new Map<string, number>();

  for (const { candidate } of candidates) {
    candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
  }

  return new Map(candidates.map(({ workspacePackage, candidate }) => [
    workspacePackage.id,
    candidateCounts.get(candidate) === 1
      ? candidate
      : workspacePackage.name ?? workspacePackage.rootPath,
  ]));
}

function packageLabelCandidate(workspacePackage: WorkspacePackage): string {
  if (workspacePackage.name) {
    const nameSegments = workspacePackage.name.split('/').filter(Boolean);
    return nameSegments.at(-1) ?? workspacePackage.name;
  }

  const pathSegments = workspacePackage.rootPath.split('/').filter(Boolean);
  return pathSegments.at(-1) ?? workspacePackage.rootPath;
}

function filesystemGroupForPackage(workspacePackage: WorkspacePackage): string {
  return workspacePackage.rootPath.split('/').filter(Boolean).at(0) ?? '.';
}

function filesystemGroups(nodes: ExplorerWorkspacePackageProjectionNode[]): ExplorerFilesystemGroup[] {
  const groups = new Map<string, string[]>();

  for (const node of nodes) {
    const labels = groups.get(node.filesystemGroup) ?? [];
    labels.push(node.presentationLabel);
    groups.set(node.filesystemGroup, labels);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, partLabels]) => ({ id, label: id === '.' ? './' : `${id}/`, partLabels }));
}
