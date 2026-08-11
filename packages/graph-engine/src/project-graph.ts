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

interface ProjectGraphIndex {
  outgoingEdges: Map<string, ProjectGraphEdge[]>;
  incomingEdges: Map<string, ProjectGraphEdge[]>;
  connectedNodeIds: Set<string>;
  fileNodeIds: Set<string>;
}

const graphIndexes = new WeakMap<ProjectGraph, ProjectGraphIndex>();

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

function graphIndex(graph: ProjectGraph): ProjectGraphIndex {
  const cachedIndex = graphIndexes.get(graph);

  if (cachedIndex) {
    return cachedIndex;
  }

  const outgoingEdges = new Map<string, ProjectGraphEdge[]>();
  const incomingEdges = new Map<string, ProjectGraphEdge[]>();
  const connectedNodeIds = new Set<string>();
  const fileNodeIds = new Set(
    graph.nodes.filter((node) => node.kind === 'file').map((node) => node.id),
  );

  for (const edge of graph.edges) {
    const outgoing = outgoingEdges.get(edge.sourceNodeId) ?? [];
    outgoing.push(edge);
    outgoingEdges.set(edge.sourceNodeId, outgoing);

    const incoming = incomingEdges.get(edge.targetNodeId) ?? [];
    incoming.push(edge);
    incomingEdges.set(edge.targetNodeId, incoming);

    connectedNodeIds.add(edge.sourceNodeId);
    connectedNodeIds.add(edge.targetNodeId);
  }

  for (const [nodeId, edges] of outgoingEdges) {
    outgoingEdges.set(nodeId, edges.sort(compareEdges));
  }

  for (const [nodeId, edges] of incomingEdges) {
    incomingEdges.set(nodeId, edges.sort(compareEdges));
  }

  const index = {
    outgoingEdges,
    incomingEdges,
    connectedNodeIds,
    fileNodeIds,
  };
  graphIndexes.set(graph, index);

  return index;
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
  return [...(graphIndex(graph).outgoingEdges.get(nodeId) ?? [])];
}

/** Returns incoming dependency edges for a node. */
export function getDependents(graph: ProjectGraph, nodeId: string): ProjectGraphEdge[] {
  return [...(graphIndex(graph).incomingEdges.get(nodeId) ?? [])];
}

/** Returns file nodes with no incoming or outgoing dependency edges. */
export function getIsolatedFileNodes(graph: ProjectGraph): FileGraphNode[] {
  const { connectedNodeIds } = graphIndex(graph);

  return graph.nodes
    .filter((node): node is FileGraphNode => node.kind === 'file' && !connectedNodeIds.has(node.id))
    .sort(compareNodes);
}

/** Detects one deterministic representative cycle per circular file component. */
export function detectCycles(graph: ProjectGraph): ProjectGraphCycle[] {
  const { fileNodeIds } = graphIndex(graph);
  const adjacency = fileAdjacency(graph, fileNodeIds);
  const components = stronglyConnectedComponents([...fileNodeIds].sort(), adjacency);
  const cycles: ProjectGraphCycle[] = [];

  for (const component of components) {
    if (component.length === 1) {
      const [nodeId] = component;

      if (nodeId && (adjacency.get(nodeId) ?? []).includes(nodeId)) {
        cycles.push({ nodeIds: [nodeId, nodeId] });
      }

      continue;
    }

    const cycleNodeIds = representativeCycle(component, adjacency);

    if (cycleNodeIds) {
      cycles.push({ nodeIds: cycleNodeIds });
    }
  }

  return cycles.sort((left, right) => left.nodeIds.join('\0').localeCompare(right.nodeIds.join('\0')));
}

function fileAdjacency(graph: ProjectGraph, fileNodeIds: Set<string>): Map<string, string[]> {
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

  return adjacency;
}

function stronglyConnectedComponents(nodes: string[], adjacency: Map<string, string[]>): string[][] {
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const stacked = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  function connect(nodeId: string): void {
    indexes.set(nodeId, nextIndex);
    lowLinks.set(nodeId, nextIndex);
    nextIndex += 1;
    stack.push(nodeId);
    stacked.add(nodeId);

    for (const targetNodeId of adjacency.get(nodeId) ?? []) {
      if (!indexes.has(targetNodeId)) {
        connect(targetNodeId);
        lowLinks.set(
          nodeId,
          Math.min(lowLinks.get(nodeId) ?? 0, lowLinks.get(targetNodeId) ?? 0),
        );
        continue;
      }

      if (stacked.has(targetNodeId)) {
        lowLinks.set(
          nodeId,
          Math.min(lowLinks.get(nodeId) ?? 0, indexes.get(targetNodeId) ?? 0),
        );
      }
    }

    if (lowLinks.get(nodeId) !== indexes.get(nodeId)) {
      return;
    }

    const component: string[] = [];
    let currentNodeId: string | undefined;

    do {
      currentNodeId = stack.pop();

      if (!currentNodeId) {
        break;
      }

      stacked.delete(currentNodeId);
      component.push(currentNodeId);
    } while (currentNodeId !== nodeId);

    components.push(component.sort());
  }

  for (const nodeId of nodes) {
    if (!indexes.has(nodeId)) {
      connect(nodeId);
    }
  }

  return components.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
}

function representativeCycle(component: readonly string[], adjacency: Map<string, string[]>): string[] | undefined {
  const componentNodes = new Set(component);

  for (const startNodeId of [...component].sort()) {
    const path = findCyclePath(startNodeId, startNodeId, adjacency, componentNodes, [startNodeId], new Set([startNodeId]));

    if (path) {
      return path;
    }
  }

  return undefined;
}

function findCyclePath(
  startNodeId: string,
  currentNodeId: string,
  adjacency: Map<string, string[]>,
  componentNodes: Set<string>,
  path: string[],
  visited: Set<string>,
): string[] | undefined {
  for (const targetNodeId of adjacency.get(currentNodeId) ?? []) {
    if (!componentNodes.has(targetNodeId)) {
      continue;
    }

    if (targetNodeId === startNodeId) {
      return [...path, startNodeId];
    }

    if (visited.has(targetNodeId)) {
      continue;
    }

    visited.add(targetNodeId);
    path.push(targetNodeId);

    const cyclePath = findCyclePath(startNodeId, targetNodeId, adjacency, componentNodes, path, visited);

    if (cyclePath) {
      return cyclePath;
    }

    path.pop();
  }

  return undefined;
}
