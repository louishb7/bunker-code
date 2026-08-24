import type { ExplorerProjection, ExplorerProjectionEdge } from './explorer-projection.js';
import type { ExplorerState } from './explorer-state.js';
import { relationshipRole, type RelativeRelationshipRole } from './relationship-language.js';

export type NodeAttentionRole = 'baseline' | 'selected' | 'anchor' | 'direct' | 'additional-context' | 'subdued';
export type EdgeAttentionRole = 'baseline' | 'direct' | 'selected-context' | 'additional-context' | 'subdued';

export interface ExplorerNodeAttention {
  role: NodeAttentionRole;
  selected: boolean;
  anchorRelationshipRole: RelativeRelationshipRole;
  selectedRelationshipRole: RelativeRelationshipRole;
}

export interface ExplorerEdgeAttention {
  role: EdgeAttentionRole;
  relationshipRole: RelativeRelationshipRole;
}

export interface ExplorerAttention {
  nodes: ReadonlyMap<string, ExplorerNodeAttention>;
  edges: ReadonlyMap<string, ExplorerEdgeAttention>;
}

export function createExplorerAttention(
  projection: ExplorerProjection,
  state: ExplorerState,
): ExplorerAttention {
  const selectedNodeId = state.scope === 'system' ? state.selectedPackageId : state.selectedNodeId;
  const anchorNodeId = state.scope === 'system' ? null : state.focusedNodeId;
  const nodes = new Map<string, ExplorerNodeAttention>();

  for (const node of projection.nodes) {
    const anchorRelationshipRole = nodeRelationshipRole(node.id, anchorNodeId, projection.edges);
    const selectedRelationshipRole = nodeRelationshipRole(node.id, selectedNodeId, projection.edges);

    nodes.set(node.id, {
      role: nodeAttentionRole(
        node.id,
        selectedNodeId,
        anchorNodeId,
        anchorRelationshipRole,
        selectedRelationshipRole,
      ),
      selected: node.id === selectedNodeId,
      anchorRelationshipRole,
      selectedRelationshipRole,
    });
  }

  return {
    nodes,
    edges: new Map(projection.edges.map((edge) => [
      explorerAttentionEdgeKey(edge.kind, edge.sourceNodeId, edge.targetNodeId),
      edgeAttention(edge, selectedNodeId, anchorNodeId, nodes),
    ])),
  };
}

export function explorerAttentionEdgeKey(
  kind: ExplorerProjectionEdge['kind'],
  sourceNodeId: string,
  targetNodeId: string,
): string {
  return `${kind}:${sourceNodeId}->${targetNodeId}`;
}

function nodeAttentionRole(
  nodeId: string,
  selectedNodeId: string | null,
  anchorNodeId: string | null,
  anchorRelationshipRole: RelativeRelationshipRole,
  selectedRelationshipRole: RelativeRelationshipRole,
): NodeAttentionRole {
  if (nodeId === anchorNodeId) {
    return 'anchor';
  }

  if (anchorNodeId) {
    return anchorRelationshipRole === 'unrelated' ? 'additional-context' : 'direct';
  }

  if (!selectedNodeId) {
    return 'baseline';
  }

  if (nodeId === selectedNodeId) {
    return 'selected';
  }

  return selectedRelationshipRole === 'unrelated' ? 'subdued' : 'direct';
}

function edgeAttention(
  edge: ExplorerProjectionEdge,
  selectedNodeId: string | null,
  anchorNodeId: string | null,
  nodes: ReadonlyMap<string, ExplorerNodeAttention>,
): ExplorerEdgeAttention {
  const anchorRole = relationshipRole(anchorNodeId, edge);

  if (anchorNodeId && anchorRole !== 'unrelated') {
    return { role: 'direct', relationshipRole: anchorRole };
  }

  const selectedRole = relationshipRole(selectedNodeId, edge);
  if (selectedNodeId && selectedRole !== 'unrelated') {
    return {
      role: anchorNodeId ? 'selected-context' : 'direct',
      relationshipRole: selectedRole,
    };
  }

  if (anchorNodeId) {
    const sourceRole = nodes.get(edge.sourceNodeId)?.role;
    const targetRole = nodes.get(edge.targetNodeId)?.role;
    return {
      role: sourceRole === 'additional-context' || targetRole === 'additional-context'
        ? 'additional-context'
        : 'subdued',
      relationshipRole: 'unrelated',
    };
  }

  return {
    role: selectedNodeId ? 'subdued' : 'baseline',
    relationshipRole: 'unrelated',
  };
}

function nodeRelationshipRole(
  nodeId: string,
  referenceNodeId: string | null,
  edges: ExplorerProjectionEdge[],
): RelativeRelationshipRole {
  if (!referenceNodeId || nodeId === referenceNodeId) {
    return 'unrelated';
  }

  let incoming = false;
  let outgoing = false;

  for (const edge of edges) {
    if (edge.sourceNodeId === referenceNodeId && edge.targetNodeId === nodeId) {
      outgoing = true;
    }

    if (edge.targetNodeId === referenceNodeId && edge.sourceNodeId === nodeId) {
      incoming = true;
    }
  }

  if (outgoing) {
    return 'uses';
  }

  return incoming ? 'used-by' : 'unrelated';
}
