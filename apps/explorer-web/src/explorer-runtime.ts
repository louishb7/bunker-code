import { buildProjectGraph, buildProjectStructure } from '@bunker-code/graph-engine';
import type { AnalysisResult } from '@bunker-code/contracts';
import type { PackageDependency, ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';

export interface ExplorerSnapshot {
  analysis: AnalysisResult;
  packageDependencies: PackageDependency[];
  projectLabel?: string;
}

export type ExplorerRuntimeState =
  | { kind: 'loading' }
  | { kind: 'invalid-snapshot'; message: string }
  | { kind: 'empty-graph'; graph: ProjectGraph }
  | {
    kind: 'ready';
    graph: ProjectGraph;
    structure: ProjectStructure;
    packageDependencies: PackageDependency[];
    projectLabel: string;
  };

export function createExplorerRuntime(snapshot: unknown): ExplorerRuntimeState {
  const explorerSnapshot = readExplorerSnapshot(snapshot);

  if (!explorerSnapshot) {
    return {
      kind: 'invalid-snapshot',
      message: 'The generated snapshot is not a usable Explorer snapshot.',
    };
  }

  try {
    const graph = buildProjectGraph(explorerSnapshot.analysis);

    if (!graph.nodes.some((node) => node.kind === 'file')) {
      return { kind: 'empty-graph', graph };
    }

    const structure = buildProjectStructure(explorerSnapshot.analysis);
    return {
      kind: 'ready',
      graph,
      structure,
      packageDependencies: explorerSnapshot.packageDependencies,
      projectLabel: readProjectLabel(explorerSnapshot),
    };
  } catch (error) {
    return {
      kind: 'invalid-snapshot',
      message: error instanceof Error ? error.message : 'The generated snapshot could not be read.',
    };
  }
}

function readExplorerSnapshot(value: unknown): ExplorerSnapshot | null {
  if (isExplorerSnapshot(value)) {
    return value;
  }

  if (isAnalysisResult(value) && !value.structure) {
    return { analysis: value, packageDependencies: [] };
  }

  return null;
}

function isExplorerSnapshot(value: unknown): value is ExplorerSnapshot {
  return isRecord(value)
    && isAnalysisResult(value.analysis)
    && Array.isArray(value.packageDependencies)
    && value.packageDependencies.every(isPackageDependency)
    && (value.projectLabel === undefined || typeof value.projectLabel === 'string');
}

function readProjectLabel(snapshot: ExplorerSnapshot): string {
  const explicitLabel = snapshot.projectLabel?.trim();

  if (explicitLabel) {
    return explicitLabel;
  }

  if (snapshot.analysis.projectPath === '.') {
    return 'Analyzed project';
  }

  const pathSegments = snapshot.analysis.projectPath.split('/').filter(Boolean);
  return pathSegments.at(-1) ?? 'Analyzed project';
}

function isPackageDependency(value: unknown): value is PackageDependency {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.sourcePackageId === 'string'
    && typeof value.targetPackageId === 'string'
    && value.kind === 'dependency'
    && Array.isArray(value.fileDependencies);
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)) {
    return false;
  }

  return value.schemaVersion === 1
    && isRecord(value.analyzer)
    && Array.isArray(value.files)
    && Array.isArray(value.dependencies)
    && Array.isArray(value.unresolvedDependencies)
    && Array.isArray(value.diagnostics);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
