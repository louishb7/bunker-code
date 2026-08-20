import { getDependencies, getDependents } from '@bunker-code/graph-engine';
import type { FileGraphNode, ProjectGraph, ProjectGraphEdge, ProjectGraphNode } from '@bunker-code/graph-engine';

export interface ExplorerState {
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  expandedNodeIds: ReadonlySet<string>;
}

export interface ExplorerProjection {
  mode: 'overview' | 'focus';
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  visibleNodeIds: ReadonlySet<string>;
}

export function createExplorerProjection(graph: ProjectGraph, state: ExplorerState): ExplorerProjection {
  if (!state.focusedNodeId) {
    return overviewProjection(graph);
  }

  const focusedNode = graph.nodes.find((node): node is FileGraphNode => (
    node.id === state.focusedNodeId && node.kind === 'file'
  ));

  if (!focusedNode) {
    throw new Error(`Focus target file not found in project graph: ${state.focusedNodeId}`);
  }

  const visibleNodeIds = new Set<string>([focusedNode.id]);
  addDirectContext(graph, focusedNode.id, visibleNodeIds);

  for (const expandedNodeId of [...state.expandedNodeIds].sort()) {
    if (graph.nodes.some((node) => node.id === expandedNodeId)) {
      addDirectContext(graph, expandedNodeId, visibleNodeIds);
    }
  }

  return projectionFromVisibleNodeIds(graph, 'focus', visibleNodeIds);
}

function overviewProjection(graph: ProjectGraph): ExplorerProjection {
  return projectionFromVisibleNodeIds(
    graph,
    'overview',
    new Set(graph.nodes.filter((node) => node.kind === 'file').map((node) => node.id)),
  );
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
  graph: ProjectGraph,
  mode: ExplorerProjection['mode'],
  visibleNodeIds: ReadonlySet<string>,
): ExplorerProjection {
  return {
    mode,
    visibleNodeIds,
    nodes: graph.nodes.filter((node) => visibleNodeIds.has(node.id)),
    edges: graph.edges.filter((edge) => (
      visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId)
    )),
  };
}
