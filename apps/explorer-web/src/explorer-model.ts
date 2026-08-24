import { MarkerType, type Edge, type Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ExplorerProjection, ExplorerProjectionEdge, ExplorerProjectionNode } from './explorer-projection.js';
import { fileNameFromPath } from './explorer-search.js';
import { describeRelationship } from './relationship-language.js';

export interface ExplorerNodeData extends Record<string, unknown> {
  label: string;
  subtitle: string;
  kind: 'file' | 'external' | 'workspace-package';
  path?: string;
  contextLabel?: string;
  technicalLabel?: string;
  fileCount?: number;
  usesCount?: number;
  usedByCount?: number;
}

export interface ExplorerEdgeData extends Record<string, unknown> {
  relation: ExplorerProjectionEdge['relation'];
  relations: ExplorerProjectionEdge['relation'][];
  kind: ExplorerProjectionEdge['kind'];
  occurrenceCount: number;
  sourceLabel: string;
  targetLabel: string;
  accessibleLabel: string;
}

export type ExplorerNode = Node<ExplorerNodeData>;
export type ExplorerEdge = Edge<ExplorerEdgeData>;

export interface ExplorerElements {
  mode: ExplorerProjection['mode'];
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
}

const fileNodeDimensions = { width: 250, height: 86 };
const systemPartNodeDimensions = { width: 280, height: 150 };
const elk = new ELK();

/** Adapts the Web projection into renderer-owned React Flow elements. */
export function createExplorerElements(projection: ExplorerProjection): ExplorerElements {
  const nodes = projection.nodes.map((node) => createExplorerNode(node));
  const labels = new Map(nodes.map((node) => [node.id, node.data.label] as const));

  return {
    mode: projection.mode,
    nodes,
    edges: aggregateVisualEdges(projection.edges).map((edges) => {
      const [edge] = edges;

      if (!edge) {
        throw new Error('Visual relationship group cannot be empty.');
      }

      const sourceLabel = labels.get(edge.sourceNodeId) ?? edge.sourceNodeId;
      const targetLabel = labels.get(edge.targetNodeId) ?? edge.targetNodeId;
      const accessibleLabel = describeRelationship(sourceLabel, targetLabel);

      return {
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        ariaLabel: accessibleLabel,
        selectable: false,
        focusable: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 22,
          height: 22,
          color: '#8fa2b1',
        },
        data: {
          relation: edge.relation,
          relations: edges.map((item) => item.relation),
          kind: edge.kind,
          occurrenceCount: edges.length,
          sourceLabel,
          targetLabel,
          accessibleLabel,
        },
      };
    }),
  };
}

function aggregateVisualEdges(edges: ExplorerProjectionEdge[]): ExplorerProjectionEdge[][] {
  const groups = new Map<string, ExplorerProjectionEdge[]>();

  for (const edge of edges) {
    const key = `${edge.kind}:${edge.sourceNodeId}->${edge.targetNodeId}`;
    const group = groups.get(key);

    if (group) {
      group.push(edge);
    } else {
      groups.set(key, [edge]);
    }
  }

  return [...groups.values()];
}

function createExplorerNode(node: ExplorerProjectionNode): ExplorerNode {
  if (node.kind === 'workspace-package') {
    return {
      id: node.id,
      position: { x: 0, y: 0 },
      data: {
        label: node.presentationLabel,
        subtitle: 'Part of this system',
        kind: node.kind,
        path: node.workspacePackage.rootPath,
        technicalLabel: node.technicalLabel,
        fileCount: node.fileCount,
        usesCount: node.usesCount,
        usedByCount: node.usedByCount,
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
  const isSystemMap = elements.mode === 'system';
  const layout = await elk.layout({
    id: 'explorer',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': isSystemMap ? 'DOWN' : 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': isSystemMap ? '82' : '72',
      'elk.spacing.nodeNode': isSystemMap ? '40' : '32',
    },
    children: elements.nodes.map((node) => {
      const dimensions = node.data.kind === 'workspace-package' ? systemPartNodeDimensions : fileNodeDimensions;
      return { id: node.id, ...dimensions };
    }),
    edges: elements.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  const positions = new Map(
    (layout.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }] as const),
  );

  return {
    mode: elements.mode,
    edges: elements.edges,
    nodes: elements.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}
