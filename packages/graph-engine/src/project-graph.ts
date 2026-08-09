import type {
  AnalysisResult,
  Confidence,
  DependencyEvidence,
  DependencyKind,
  UnresolvedDependencyReason,
} from '@bunker-code/contracts';

export type ProjectGraphNode = FileGraphNode | ExternalGraphNode;

export interface FileGraphNode {
  id: string;
  kind: 'file';
  path: string;
}

export interface ExternalGraphNode {
  id: string;
  kind: 'external';
  moduleSpecifier: string;
}

export interface ProjectGraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: 'dependency';
  dependencyKind: DependencyKind;
  moduleSpecifier: string;
  evidence: DependencyEvidence;
  confidence: Confidence;
}

export interface UnresolvedGraphDependency {
  id: string;
  sourceNodeId: string;
  moduleSpecifier: string;
  reason: UnresolvedDependencyReason;
  evidence: DependencyEvidence;
  confidence: Confidence;
}

export interface ProjectGraphCycle {
  nodeIds: string[];
}

export interface ProjectGraph {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  unresolvedDependencies: UnresolvedGraphDependency[];
}

function externalNodeId(moduleSpecifier: string): string {
  return `external:${moduleSpecifier}`;
}

function edgeId(parts: {
  sourceNodeId: string;
  targetNodeId: string;
  moduleSpecifier: string;
  line: number;
  column: number;
}): string {
  return [
    parts.sourceNodeId,
    parts.targetNodeId,
    parts.moduleSpecifier,
    `${parts.line}:${parts.column}`,
  ].join(' -> ');
}

function unresolvedDependencyId(parts: {
  sourceNodeId: string;
  moduleSpecifier: string;
  line: number;
  column: number;
}): string {
  return [
    parts.sourceNodeId,
    parts.moduleSpecifier,
    `${parts.line}:${parts.column}`,
  ].join(' ? ');
}

function compareNodes(left: ProjectGraphNode, right: ProjectGraphNode): number {
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

function compareUnresolved(left: UnresolvedGraphDependency, right: UnresolvedGraphDependency): number {
  return (
    left.sourceNodeId.localeCompare(right.sourceNodeId) ||
    left.moduleSpecifier.localeCompare(right.moduleSpecifier) ||
    left.evidence.location.line - right.evidence.location.line ||
    left.evidence.location.column - right.evidence.location.column
  );
}

/** Builds a deterministic graph from a serializable analysis result. */
export function buildProjectGraph(analysis: AnalysisResult): ProjectGraph {
  const nodes = new Map<string, ProjectGraphNode>();
  const edges: ProjectGraphEdge[] = [];

  for (const file of analysis.files) {
    nodes.set(file.id, {
      id: file.id,
      kind: 'file',
      path: file.path,
    });
  }

  for (const dependency of analysis.dependencies) {
    const targetNodeId = dependency.targetFileId ?? externalNodeId(dependency.moduleSpecifier);

    if (!nodes.has(targetNodeId)) {
      nodes.set(targetNodeId, {
        id: targetNodeId,
        kind: 'external',
        moduleSpecifier: dependency.moduleSpecifier,
      });
    }

    edges.push({
      id: edgeId({
        sourceNodeId: dependency.sourceFileId,
        targetNodeId,
        moduleSpecifier: dependency.moduleSpecifier,
        line: dependency.evidence.location.line,
        column: dependency.evidence.location.column,
      }),
      sourceNodeId: dependency.sourceFileId,
      targetNodeId,
      kind: 'dependency',
      dependencyKind: dependency.kind,
      moduleSpecifier: dependency.moduleSpecifier,
      evidence: dependency.evidence,
      confidence: dependency.confidence,
    });
  }

  const unresolvedDependencies = analysis.unresolvedDependencies.map((dependency) => ({
    id: unresolvedDependencyId({
      sourceNodeId: dependency.sourceFileId,
      moduleSpecifier: dependency.moduleSpecifier,
      line: dependency.evidence.location.line,
      column: dependency.evidence.location.column,
    }),
    sourceNodeId: dependency.sourceFileId,
    moduleSpecifier: dependency.moduleSpecifier,
    reason: dependency.reason,
    evidence: dependency.evidence,
    confidence: dependency.confidence,
  }));

  return {
    nodes: [...nodes.values()].sort(compareNodes),
    edges: [...edges].sort(compareEdges),
    unresolvedDependencies: [...unresolvedDependencies].sort(compareUnresolved),
  };
}

/** Returns outgoing dependency edges for a node. */
export function getDependencies(graph: ProjectGraph, nodeId: string): ProjectGraphEdge[] {
  return graph.edges.filter((edge) => edge.sourceNodeId === nodeId).sort(compareEdges);
}

/** Returns incoming dependency edges for a node. */
export function getDependents(graph: ProjectGraph, nodeId: string): ProjectGraphEdge[] {
  return graph.edges.filter((edge) => edge.targetNodeId === nodeId).sort(compareEdges);
}

/** Returns file nodes with no incoming or outgoing dependency edges. */
export function getIsolatedFileNodes(graph: ProjectGraph): FileGraphNode[] {
  const connectedNodeIds = new Set<string>();

  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.sourceNodeId);
    connectedNodeIds.add(edge.targetNodeId);
  }

  return graph.nodes
    .filter((node): node is FileGraphNode => node.kind === 'file' && !connectedNodeIds.has(node.id))
    .sort(compareNodes);
}

/** Detects deterministic file-to-file dependency cycles. */
export function detectCycles(graph: ProjectGraph): ProjectGraphCycle[] {
  const fileNodeIds = new Set(
    graph.nodes.filter((node) => node.kind === 'file').map((node) => node.id),
  );
  const adjacency = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!fileNodeIds.has(edge.sourceNodeId) || !fileNodeIds.has(edge.targetNodeId)) {
      continue;
    }

    const targets = adjacency.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, targets);
  }

  for (const [nodeId, targets] of adjacency) {
    adjacency.set(nodeId, [...new Set(targets)].sort());
  }

  const cycles = new Map<string, ProjectGraphCycle>();

  for (const startNodeId of [...fileNodeIds].sort()) {
    visitCycles(startNodeId, startNodeId, adjacency, [], cycles);
  }

  return [...cycles.values()].sort((left, right) => left.nodeIds.join('\0').localeCompare(right.nodeIds.join('\0')));
}

function visitCycles(
  startNodeId: string,
  currentNodeId: string,
  adjacency: Map<string, string[]>,
  path: string[],
  cycles: Map<string, ProjectGraphCycle>,
): void {
  const nextPath = [...path, currentNodeId];

  for (const nextNodeId of adjacency.get(currentNodeId) ?? []) {
    if (nextNodeId === startNodeId) {
      const cycleNodeIds = normalizeCycle([...nextPath, startNodeId]);
      cycles.set(cycleNodeIds.join('\0'), { nodeIds: cycleNodeIds });
      continue;
    }

    if (nextPath.includes(nextNodeId)) {
      continue;
    }

    visitCycles(startNodeId, nextNodeId, adjacency, nextPath, cycles);
  }
}

function normalizeCycle(cycleNodeIds: string[]): string[] {
  const openCycle = cycleNodeIds.slice(0, -1);
  const rotations = openCycle.map((_, index) => [
    ...openCycle.slice(index),
    ...openCycle.slice(0, index),
  ]);
  const normalizedOpenCycle = rotations
    .map((rotation) => rotation)
    .sort((left, right) => left.join('\0').localeCompare(right.join('\0')))[0];

  if (!normalizedOpenCycle) {
    return cycleNodeIds;
  }

  return [...normalizedOpenCycle, normalizedOpenCycle[0] ?? cycleNodeIds[0] ?? ''];
}
