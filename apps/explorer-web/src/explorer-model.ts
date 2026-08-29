import { MarkerType, type Edge, type Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ExplorerProjection, ExplorerProjectionEdge, ExplorerProjectionNode } from './explorer-projection.js';
import { fileNameFromPath } from './explorer-search.js';
import { describeRelationship } from './relationship-language.js';

export interface ExplorerNodeData extends Record<string, unknown> {
  label: string;
  subtitle: string;
  kind: 'file' | 'external' | 'territory';
  path?: string;
  contextLabel?: string;
  scopeRole?: 'owned' | 'contextual' | 'project';
  territoryKind?: 'system' | 'directory' | 'workspace-package';
  analyzedFileCount?: number;
  directChildTerritoryCount?: number;
  attentionLabel?: string;
  attentionRole?: string;
  selectedForInspection?: boolean;
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

const fileNodeDimensions = { width: 218, height: 72 };
const territoryNodeDimensions = { width: 260, height: 118 };
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
  if (node.kind === 'territory') {
    return {
      id: node.id,
      position: { x: 0, y: 0 },
      data: {
        label: node.territory.label,
        subtitle: node.territory.kind === 'workspace-package' ? 'Workspace package' : 'Directory',
        kind: node.kind,
        path: node.territory.structuralPath.join('/'),
        territoryKind: node.territory.kind,
        analyzedFileCount: node.territory.analyzedFileCount,
        directChildTerritoryCount: node.territory.directChildTerritoryCount,
      },
    };
  }

  if (node.kind === 'file') {
    return {
      id: node.id,
      position: { x: 0, y: 0 },
      data: {
        label: fileNameFromPath(node.path),
        path: node.path,
        kind: node.kind,
        scopeRole: node.scopeRole,
        subtitle: node.scopeRole === 'contextual'
          ? 'Relationship context'
          : node.scopeRole === 'owned'
            ? 'File in this part'
            : 'Analyzed file',
        contextLabel: undefined,
      },
    };
  }

  return {
    id: node.id,
    position: { x: 0, y: 0 },
    data: {
      label: node.moduleSpecifier,
      subtitle: 'Outside this analyzed system',
      contextLabel: 'External module',
      kind: node.kind,
    },
  };
}

/** Uses the analytical edge direction: dependent source to dependency target. */
export async function layoutExplorerElements(elements: ExplorerElements): Promise<ExplorerElements> {
  const isRoot = elements.mode === 'root';
  const layout = await elk.layout({
    id: 'explorer',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': isRoot ? '72' : elements.mode === 'territory' ? '54' : '64',
      'elk.spacing.nodeNode': isRoot ? '36' : elements.mode === 'territory' ? '24' : '30',
    },
    children: elements.nodes.map((node) => {
      const dimensions = node.data.kind === 'territory' ? territoryNodeDimensions : fileNodeDimensions;
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
