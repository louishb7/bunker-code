import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { getDependencies, getDependents } from '@bunker-code/graph-engine';
import type { FileGraphNode, ProjectGraph, ProjectGraphEdge } from '@bunker-code/graph-engine';

export interface ExplorerNodeData extends Record<string, unknown> {
  path: string;
}

export interface ExplorerEdgeData extends Record<string, unknown> {
  relation: ProjectGraphEdge;
}

export type ExplorerNode = Node<ExplorerNodeData>;
export type ExplorerEdge = Edge<ExplorerEdgeData>;

export interface ExplorerElements {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
}

export interface SelectedNeighborhood {
  targetNodeId: string | null;
  dependencyNodeIds: ReadonlySet<string>;
  dependentNodeIds: ReadonlySet<string>;
}

const nodeWidth = 220;
const nodeHeight = 52;
const elk = new ELK();

function fileNodes(graph: ProjectGraph): FileGraphNode[] {
  return graph.nodes.filter((node): node is FileGraphNode => node.kind === 'file');
}

/** Projects analytical file facts into renderer-owned React Flow elements. */
export function createExplorerElements(graph: ProjectGraph): ExplorerElements {
  const nodes = fileNodes(graph).map((node) => ({
    id: node.id,
    position: { x: 0, y: 0 },
    data: { path: node.path },
  }));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
    .map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      data: { relation: edge },
    }));

  return { nodes, edges };
}

/** Uses the analytical edge direction: dependent source to dependency target. */
export async function layoutExplorerElements(elements: ExplorerElements): Promise<ExplorerElements> {
  const layout = await elk.layout({
    id: 'explorer',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.spacing.nodeNode': '32',
    },
    children: elements.nodes.map((node) => ({ id: node.id, width: nodeWidth, height: nodeHeight })),
    edges: elements.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  const positions = new Map(
    (layout.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }] as const),
  );

  return {
    edges: elements.edges,
    nodes: elements.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

export function selectedNeighborhood(graph: ProjectGraph, targetNodeId: string | null): SelectedNeighborhood {
  if (!targetNodeId) {
    return { targetNodeId: null, dependencyNodeIds: new Set(), dependentNodeIds: new Set() };
  }

  const fileNodeIds = new Set(fileNodes(graph).map((node) => node.id));
  return {
    targetNodeId,
    dependencyNodeIds: new Set(
      getDependencies(graph, targetNodeId)
        .map((edge) => edge.targetNodeId)
        .filter((nodeId) => fileNodeIds.has(nodeId)),
    ),
    dependentNodeIds: new Set(
      getDependents(graph, targetNodeId)
        .map((edge) => edge.sourceNodeId)
        .filter((nodeId) => fileNodeIds.has(nodeId)),
    ),
  };
}
