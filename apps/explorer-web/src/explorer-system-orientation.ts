import {
  aggregatePackageDependencies,
  detectCycles,
  getIsolatedFileNodes,
  getWorkspacePackageForFile,
  getWorkspacePackages,
} from '@bunker-code/graph-engine';
import type { ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';

export interface ExplorerSystemOrientationProjection {
  packageConnections: ExplorerPackageConnection[];
  externalModules: ExplorerExternalModuleUsage[];
  cycles: ExplorerCycleObservation[];
  isolatedFiles: ExplorerIsolatedFileObservation[];
  unresolvedDependencies: ExplorerUnresolvedDependencyObservation[];
}

export interface ExplorerPackageConnection {
  id: string;
  source: ExplorerOrientationPackage;
  target: ExplorerOrientationPackage;
  fileDependencyCount: number;
}

export interface ExplorerOrientationPackage {
  id: string;
  label: string;
}

export interface ExplorerExternalModuleUsage {
  moduleSpecifier: string;
  sourceFileIds: string[];
  sourcePackageIds: string[];
}

export interface ExplorerCycleObservation {
  fileIds: string[];
}

export interface ExplorerIsolatedFileObservation {
  id: string;
  path: string;
}

export interface ExplorerUnresolvedDependencyObservation {
  id: string;
  sourceFileId: string;
  moduleSpecifier: string;
  reason: string;
}

export function createExplorerSystemOrientationProjection(
  graph: ProjectGraph,
  structure: ProjectStructure,
): ExplorerSystemOrientationProjection {
  const packagesById = new Map(getWorkspacePackages(structure).map((workspacePackage) => [
    workspacePackage.id,
    { id: workspacePackage.id, label: workspacePackage.name ?? workspacePackage.rootPath },
  ] as const));
  const packageConnections = aggregatePackageDependencies(graph, structure).flatMap((dependency) => {
    const source = packagesById.get(dependency.sourcePackageId);
    const target = packagesById.get(dependency.targetPackageId);

    return source && target ? [{
      id: dependency.id,
      source,
      target,
      fileDependencyCount: dependency.fileDependencies.length,
    }] : [];
  });
  const externalModulesBySpecifier = new Map<string, ExplorerExternalModuleUsage>();

  for (const edge of graph.edges) {
    if (edge.dependencyKind !== 'external') continue;

    const usage = externalModulesBySpecifier.get(edge.moduleSpecifier) ?? {
      moduleSpecifier: edge.moduleSpecifier,
      sourceFileIds: [],
      sourcePackageIds: [],
    };
    usage.sourceFileIds.push(edge.sourceNodeId);
    const sourcePackage = getWorkspacePackageForFile(structure, edge.sourceNodeId);
    if (sourcePackage) usage.sourcePackageIds.push(sourcePackage.id);
    externalModulesBySpecifier.set(edge.moduleSpecifier, usage);
  }

  return {
    packageConnections,
    externalModules: [...externalModulesBySpecifier.values()]
      .map((usage) => ({
        ...usage,
        sourceFileIds: [...new Set(usage.sourceFileIds)].sort(),
        sourcePackageIds: [...new Set(usage.sourcePackageIds)].sort(),
      }))
      .sort((left, right) => left.moduleSpecifier.localeCompare(right.moduleSpecifier)),
    cycles: detectCycles(graph).map((cycle) => ({ fileIds: [...cycle.nodeIds] })),
    isolatedFiles: getIsolatedFileNodes(graph).map((file) => ({ id: file.id, path: file.path })),
    unresolvedDependencies: graph.unresolvedDependencies.map((dependency) => ({
      id: dependency.id,
      sourceFileId: dependency.sourceNodeId,
      moduleSpecifier: dependency.moduleSpecifier,
      reason: dependency.reason,
    })),
  };
}
