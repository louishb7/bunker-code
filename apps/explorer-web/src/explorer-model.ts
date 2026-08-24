import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ExplorerProjection, ExplorerProjectionEdge, ExplorerProjectionNode } from './explorer-projection.js';
import { fileNameFromPath } from './explorer-search.js';

export interface ExplorerNodeData extends Record<string, unknown> {
  label: string;
  subtitle: string;
  kind: 'file' | 'external' | 'workspace-package';
  path?: string;
  contextLabel?: string;
  filesystemGroup?: string;
}

export interface ExplorerEdgeData extends Record<string, unknown> {
  relation: ExplorerProjectionEdge['relation'];
  kind: ExplorerProjectionEdge['kind'];
}

export type ExplorerNode = Node<ExplorerNodeData>;
export type ExplorerEdge = Edge<ExplorerEdgeData>;

export interface ExplorerElements {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
}

const nodeWidth = 250;
const nodeHeight = 86;
const elk = new ELK();

/** Adapts the Web projection into renderer-owned React Flow elements. */
export function createExplorerElements(projection: ExplorerProjection): ExplorerElements {
  return {
    nodes: projection.nodes.map((node) => createExplorerNode(node)),
    edges: projection.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      data: { relation: edge.relation, kind: edge.kind },
    })),
  };
}

function createExplorerNode(node: ExplorerProjectionNode): ExplorerNode {
  if (node.kind === 'workspace-package') {
    return {
      id: node.id,
      position: { x: 0, y: 0 },
      data: {
        label: node.workspacePackage.name ?? fileNameFromPath(node.workspacePackage.rootPath),
        subtitle: 'Detected workspace package',
        kind: node.kind,
        path: node.workspacePackage.rootPath,
        filesystemGroup: node.filesystemGroup,
      },
    };
  }

  if (node.kind === 'file') {
    return {
      id: node.id,
      position: { x: 0, y: 0 },
      data: {
        label: fileNameFromPath(node.path),
        subtitle: node.path,
        path: node.path,
        kind: node.kind,
        contextLabel: node.contextualWorkspacePackage
          ? `Context from ${node.contextualWorkspacePackage.name ?? node.contextualWorkspacePackage.rootPath}`
          : undefined,
      },
    };
  }

  return {
    id: node.id,
    position: { x: 0, y: 0 },
    data: { label: node.moduleSpecifier, subtitle: 'External module', kind: node.kind },
  };
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
