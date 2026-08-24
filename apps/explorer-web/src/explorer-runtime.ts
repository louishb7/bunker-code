import { aggregatePackageDependencies, buildProjectGraph, buildProjectStructure } from '@bunker-code/graph-engine';
import type { AnalysisResult } from '@bunker-code/contracts';
import type { PackageDependency, ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';

export type ExplorerRuntimeState =
  | { kind: 'loading' }
  | { kind: 'invalid-snapshot'; message: string }
  | { kind: 'empty-graph'; graph: ProjectGraph }
  | { kind: 'ready'; graph: ProjectGraph; structure: ProjectStructure; packageDependencies: PackageDependency[] };

export function createExplorerRuntime(snapshot: unknown): ExplorerRuntimeState {
  if (!isAnalysisResult(snapshot)) {
    return {
      kind: 'invalid-snapshot',
      message: 'The generated snapshot is not a usable AnalysisResult.',
    };
  }

  try {
    const graph = buildProjectGraph(snapshot);

    if (!graph.nodes.some((node) => node.kind === 'file')) {
      return { kind: 'empty-graph', graph };
    }

    const structure = buildProjectStructure(snapshot);
    return {
      kind: 'ready',
      graph,
      structure,
      packageDependencies: aggregatePackageDependencies(graph, structure),
    };
  } catch (error) {
    return {
      kind: 'invalid-snapshot',
      message: error instanceof Error ? error.message : 'The generated snapshot could not be read.',
    };
  }
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
