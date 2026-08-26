import type { Confidence } from '@bunker-code/contracts';
import {
  detectCycles,
  getDependencies,
  getDependents,
  getIsolatedFileNodes,
  type FileGraphNode,
  type ProjectGraph,
  type ProjectGraphEdge,
  type UnresolvedGraphDependency,
} from './project-graph.js';

export interface ProjectDiagnosticsThresholds {
  manyDependents: number;
  manyDependencies: number;
}

export interface ProjectDiagnosticsOptions {
  thresholds?: Partial<ProjectDiagnosticsThresholds>;
}

export interface ProjectDiagnosticsReport {
  thresholds: ProjectDiagnosticsThresholds;
  diagnostics: ProjectDiagnostic[];
}

export type ProjectDiagnosticKind =
  | 'circular-dependency'
  | 'unresolved-dependency'
  | 'fan-in'
  | 'fan-out'
  | 'many-dependents'
  | 'many-dependencies'
  | 'isolated-file';

export type ProjectDiagnosticBasis = 'fact' | 'heuristic';

export type ProjectDiagnosticSeverity = 'info' | 'warning';

export interface ProjectDiagnosticThreshold {
  name: keyof ProjectDiagnosticsThresholds;
  actual: number;
  minimum: number;
}

export type ProjectDiagnosticEvidence =
  | { kind: 'edge'; edge: ProjectGraphEdge }
  | { kind: 'unresolved-dependency'; unresolvedDependency: UnresolvedGraphDependency }
  | { kind: 'file-node'; node: FileGraphNode };

export interface ProjectDiagnostic {
  id: string;
  kind: ProjectDiagnosticKind;
  severity: ProjectDiagnosticSeverity;
  basis: ProjectDiagnosticBasis;
  confidence: Confidence;
  subject: {
    nodeId?: string;
    nodeIds?: string[];
  };
  message: string;
  evidence: ProjectDiagnosticEvidence[];
  threshold?: ProjectDiagnosticThreshold;
}

const defaultThresholds: ProjectDiagnosticsThresholds = {
  manyDependents: 2,
  manyDependencies: 3,
};

function compareDiagnostics(left: ProjectDiagnostic, right: ProjectDiagnostic): number {
  return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id);
}

function compareEdges(left: ProjectGraphEdge, right: ProjectGraphEdge): number {
  return (
    left.sourceNodeId.localeCompare(right.sourceNodeId) ||
    left.moduleSpecifier.localeCompare(right.moduleSpecifier) ||
    left.targetNodeId.localeCompare(right.targetNodeId) ||
    left.evidence.location.line - right.evidence.location.line ||
    left.evidence.location.column - right.evidence.location.column
  );
}

function compareFileNodes(left: FileGraphNode, right: FileGraphNode): number {
  return left.id.localeCompare(right.id);
}

function fileNodes(graph: ProjectGraph): FileGraphNode[] {
  return graph.nodes
    .filter((node): node is FileGraphNode => node.kind === 'file')
    .sort(compareFileNodes);
}

function aggregateConfidence(confidences: Confidence[]): Confidence {
  if (confidences.includes('uncertain')) {
    return 'uncertain';
  }

  if (confidences.includes('inferred')) {
    return 'inferred';
  }

  return 'exact';
}

function edgesForCycle(graph: ProjectGraph, nodeIds: string[]): ProjectGraphEdge[] {
  const edges: ProjectGraphEdge[] = [];

  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const sourceNodeId = nodeIds[index];
    const targetNodeId = nodeIds[index + 1];

    if (!sourceNodeId || !targetNodeId) {
      continue;
    }

    const edge = getDependencies(graph, sourceNodeId).find((candidate) => candidate.targetNodeId === targetNodeId);

    if (edge) {
      edges.push(edge);
    }
  }

  return edges.sort(compareEdges);
}

function edgeEvidence(edges: ProjectGraphEdge[]): ProjectDiagnosticEvidence[] {
  return edges.map((edge) => ({ kind: 'edge', edge }));
}

export function createProjectDiagnostics(
  graph: ProjectGraph,
  options: ProjectDiagnosticsOptions = {},
): ProjectDiagnosticsReport {
  const thresholds: ProjectDiagnosticsThresholds = {
    ...defaultThresholds,
    ...options.thresholds,
  };
  const diagnostics: ProjectDiagnostic[] = [];

  for (const cycle of detectCycles(graph)) {
    const edges = edgesForCycle(graph, cycle.nodeIds);

    diagnostics.push({
      id: `circular-dependency:${cycle.nodeIds.join(' -> ')}`,
      kind: 'circular-dependency',
      severity: 'warning',
      basis: 'fact',
      confidence: aggregateConfidence(edges.map((edge) => edge.confidence)),
      subject: { nodeIds: cycle.nodeIds },
      message: `Circular dependency detected: ${cycle.nodeIds.join(' -> ')}.`,
      evidence: edgeEvidence(edges),
    });
  }

  for (const unresolvedDependency of graph.unresolvedDependencies) {
    diagnostics.push({
      id: `unresolved-dependency:${unresolvedDependency.id}`,
      kind: 'unresolved-dependency',
      severity: 'warning',
      basis: 'fact',
      confidence: unresolvedDependency.confidence,
      subject: { nodeId: unresolvedDependency.sourceNodeId },
      message: `Unable to resolve "${unresolvedDependency.moduleSpecifier}" from "${unresolvedDependency.sourceNodeId}".`,
      evidence: [{ kind: 'unresolved-dependency', unresolvedDependency }],
    });
  }

  for (const node of fileNodes(graph)) {
    const dependents = getDependents(graph, node.id);
    const dependencies = getDependencies(graph, node.id);
    const internalDependencies = dependencies.filter((edge) => edge.dependencyKind === 'internal');

    diagnostics.push({
      id: `fan-in:${node.id}`,
      kind: 'fan-in',
      severity: 'info',
      basis: 'fact',
      confidence: aggregateConfidence(dependents.map((edge) => edge.confidence)),
      subject: { nodeId: node.id },
      message: `${node.id} has ${dependents.length} dependent file or module edge(s).`,
      evidence: edgeEvidence(dependents),
    });
    diagnostics.push({
      id: `fan-out:${node.id}`,
      kind: 'fan-out',
      severity: 'info',
      basis: 'fact',
      confidence: aggregateConfidence(dependencies.map((edge) => edge.confidence)),
      subject: { nodeId: node.id },
      message: `${node.id} has ${dependencies.length} dependency edge(s).`,
      evidence: edgeEvidence(dependencies),
    });

    if (dependents.length >= thresholds.manyDependents) {
      diagnostics.push({
        id: `many-dependents:${node.id}`,
        kind: 'many-dependents',
        severity: 'warning',
        basis: 'heuristic',
        confidence: aggregateConfidence(dependents.map((edge) => edge.confidence)),
        subject: { nodeId: node.id },
        message: `${node.id} has ${dependents.length} dependent edge(s), meeting the configured threshold ${thresholds.manyDependents}.`,
        evidence: edgeEvidence(dependents),
        threshold: {
          name: 'manyDependents',
          actual: dependents.length,
          minimum: thresholds.manyDependents,
        },
      });
    }

    if (internalDependencies.length >= thresholds.manyDependencies) {
      diagnostics.push({
        id: `many-dependencies:${node.id}`,
        kind: 'many-dependencies',
        severity: 'warning',
        basis: 'heuristic',
        confidence: aggregateConfidence(internalDependencies.map((edge) => edge.confidence)),
        subject: { nodeId: node.id },
        message: `${node.id} has ${internalDependencies.length} internal dependency edge(s), meeting the configured threshold ${thresholds.manyDependencies}.`,
        evidence: edgeEvidence(internalDependencies),
        threshold: {
          name: 'manyDependencies',
          actual: internalDependencies.length,
          minimum: thresholds.manyDependencies,
        },
      });
    }
  }

  for (const node of getIsolatedFileNodes(graph)) {
    diagnostics.push({
      id: `isolated-file:${node.id}`,
      kind: 'isolated-file',
      severity: 'info',
      basis: 'fact',
      confidence: 'exact',
      subject: { nodeId: node.id },
      message: `${node.id} has no dependency or dependent edges.`,
      evidence: [{ kind: 'file-node', node }],
    });
  }

  return {
    thresholds,
    diagnostics: diagnostics.sort(compareDiagnostics),
  };
}
