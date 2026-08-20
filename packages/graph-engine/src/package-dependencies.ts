import type { ProjectGraph, ProjectGraphEdge } from './project-graph.js';
import { getWorkspacePackageForFile, type ProjectStructure } from './project-structure.js';

export interface PackageDependency {
  id: string;
  sourcePackageId: string;
  targetPackageId: string;
  kind: 'dependency';
  fileDependencies: ProjectGraphEdge[];
}

function dependencyId(sourcePackageId: string, targetPackageId: string): string {
  return `${sourcePackageId} -> ${targetPackageId}`;
}

/** Aggregates only internal file dependency edges between distinct detected workspace packages. */
export function aggregatePackageDependencies(graph: ProjectGraph, structure: ProjectStructure): PackageDependency[] {
  const dependencies = new Map<string, PackageDependency>();

  for (const edge of graph.edges) {
    if (edge.dependencyKind !== 'internal') {
      continue;
    }

    const sourcePackage = getWorkspacePackageForFile(structure, edge.sourceNodeId);
    const targetPackage = getWorkspacePackageForFile(structure, edge.targetNodeId);

    if (!sourcePackage || !targetPackage || sourcePackage.id === targetPackage.id) {
      continue;
    }

    const id = dependencyId(sourcePackage.id, targetPackage.id);
    const dependency = dependencies.get(id) ?? {
      id,
      sourcePackageId: sourcePackage.id,
      targetPackageId: targetPackage.id,
      kind: 'dependency' as const,
      fileDependencies: [],
    };
    dependency.fileDependencies.push(edge);
    dependencies.set(id, dependency);
  }

  return [...dependencies.values()]
    .map((dependency) => ({
      ...dependency,
      fileDependencies: [...dependency.fileDependencies].sort((left, right) => left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}
