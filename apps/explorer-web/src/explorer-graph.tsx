import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import type { ExplorerNodeAttention, ExplorerEdgeAttention } from './explorer-attention.js';
import type {
  ExplorerEdge,
  ExplorerElements,
  ExplorerNode,
  ExplorerNodeData,
} from './explorer-model.js';

const graphColors = {
  baseline: '#8295a2',
  uses: '#6eb7df',
  usedBy: '#73c8bb',
  selectedContext: '#c5d1d8',
  quiet: '#536672',
} as const;

const nodeTypes = { explorer: ExplorerNodeView };

export type ExplorerReactFlowInstance = ReactFlowInstance<Node<ExplorerNodeData>, Edge>;

export function ExplorerCanvas({
  nodes,
  edges,
  mode,
  layoutState,
  onInit,
  onNodeClick,
  onPaneClick,
}: {
  nodes: Node<ExplorerNodeData>[];
  edges: Edge[];
  mode: ExplorerElements['mode'];
  layoutState: 'loading' | 'ready' | 'error';
  onInit(instance: ExplorerReactFlowInstance): void;
  onNodeClick(nodeId: string): void;
  onPaneClick(): void;
}) {
  return (
    <div className="graph-canvas" data-graph-mode={mode}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={fitViewOptions(mode)}
        minZoom={0.35}
        onInit={onInit}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        onPaneClick={onPaneClick}
      >
        <Background color="#2a3b46" gap={24} size={0.8} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {layoutState === 'loading' ? (
        <div className="graph-status" role="status"><span className="graph-status-pulse" />Arranging visible graph...</div>
      ) : null}
      {layoutState === 'error' ? (
        <div className="graph-status graph-status-error" role="alert">Unable to arrange this graph. The analytical data remains unchanged.</div>
      ) : null}
    </div>
  );
}

export function attentionFlowNode(
  node: Node<ExplorerNodeData>,
  attention: ExplorerNodeAttention | undefined,
): Node<ExplorerNodeData> {
  const resolvedAttention = attention ?? {
    role: 'baseline',
    selected: false,
    anchorRelationshipRole: 'unrelated',
    selectedRelationshipRole: 'unrelated',
  } satisfies ExplorerNodeAttention;
  const classes = ['graph-node'];

  if (node.data.kind === 'territory') classes.push('graph-node-territory');
  if (node.data.kind === 'external') classes.push('graph-node-external');
  if (node.data.scopeRole === 'contextual') classes.push('graph-node-contextual');
  classes.push(`graph-node-attention-${resolvedAttention.role}`);
  const visibleRelationshipRole = resolvedAttention.anchorRelationshipRole === 'unrelated'
    ? resolvedAttention.selectedRelationshipRole
    : resolvedAttention.anchorRelationshipRole;
  if (resolvedAttention.role === 'direct' && visibleRelationshipRole === 'uses') classes.push('graph-node-dependency');
  if (resolvedAttention.role === 'direct' && visibleRelationshipRole === 'used-by') classes.push('graph-node-dependent');
  if (resolvedAttention.role === 'anchor') classes.push('graph-node-target');
  if (resolvedAttention.selected) classes.push('graph-node-selected');

  return {
    ...node,
    type: 'explorer',
    className: classes.join(' '),
    data: {
      ...node.data,
      attentionRole: resolvedAttention.role,
      selectedForInspection: resolvedAttention.selected,
      attentionLabel: nodeAttentionLabel(node, resolvedAttention),
    },
  };
}

export function relationshipFlowEdge(edge: ExplorerEdge, attention: ExplorerEdgeAttention | undefined): ExplorerEdge {
  const role = attention?.relationshipRole ?? 'unrelated';
  const attentionRole = attention?.role ?? 'baseline';
  const labelled = attentionRole === 'direct';
  const occurrenceSuffix = edge.data && edge.data.occurrenceCount > 1
    ? ` · ${edge.data.occurrenceCount}×`
    : '';
  const activeColor = role === 'uses'
    ? graphColors.uses
    : role === 'used-by'
      ? graphColors.usedBy
      : graphColors.baseline;
  const markerColor = attentionRole === 'direct'
    ? activeColor
    : attentionRole === 'selected-context'
      ? graphColors.selectedContext
      : attentionRole === 'subdued' || attentionRole === 'additional-context'
        ? graphColors.quiet
        : graphColors.baseline;

  return {
    ...edge,
    className: `graph-edge graph-edge-attention-${attentionRole}${role !== 'unrelated' ? ` graph-edge-${role}` : ''}`,
    label: labelled && role === 'uses' ? `Uses${occurrenceSuffix}` : labelled && role === 'used-by' ? `Used by${occurrenceSuffix}` : undefined,
    labelStyle: labelled ? { fill: '#e7eef2', fontSize: 10, fontWeight: 700 } : undefined,
    labelBgStyle: labelled ? { fill: '#101b23', fillOpacity: 0.94, stroke: activeColor, strokeWidth: 0.8 } : undefined,
    labelBgPadding: labelled ? [5, 3] : undefined,
    labelBgBorderRadius: labelled ? 5 : undefined,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: attentionRole === 'direct' ? 22 : 19,
      height: attentionRole === 'direct' ? 22 : 19,
      color: markerColor,
    },
  };
}

export function fitViewOptions(mode: ExplorerElements['mode']) {
  return {
    padding: mode === 'root' ? 0.2 : 0.14,
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180,
    minZoom: mode === 'root' ? 0.55 : 0.68,
    maxZoom: 1.15,
  };
}

function ExplorerNodeView({ data }: NodeProps<ExplorerNode>) {
  if (data.kind === 'territory') {
    const fileCount = data.analyzedFileCount ?? 0;
    const childTerritoryCount = data.directChildTerritoryCount ?? 0;

    return (
      <>
        <Handle type="target" position={Position.Left} />
        <strong className="graph-node-label territory-node-name" title={data.path ?? data.label}>{data.label}</strong>
        <span className="territory-node-type">{data.subtitle}</span>
        <div className="part-node-facts">
          <span className="territory-file-count">{countLabel(fileCount, 'analyzed file')}</span>
          <span className="territory-child-count">{countLabel(childTerritoryCount, 'child territory')}</span>
        </div>
        {data.attentionLabel ? (
          <span className="graph-node-cues"><span className="graph-node-attention">{data.attentionLabel}</span></span>
        ) : null}
        <Handle type="source" position={Position.Right} />
      </>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <strong className="graph-node-label" title={data.label}>{data.label}</strong>
      {data.kind === 'external' || data.scopeRole === 'contextual' ? (
        <span className="graph-node-subtitle" title={data.subtitle}>{data.subtitle}</span>
      ) : null}
      {data.contextLabel || data.attentionLabel ? (
        <span className="graph-node-cues">
          {data.contextLabel ? <span className="graph-node-context">{data.contextLabel}</span> : null}
          {data.attentionLabel ? <span className="graph-node-attention">{data.attentionLabel}</span> : null}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function nodeAttentionLabel(
  node: Node<ExplorerNodeData>,
  attention: ExplorerNodeAttention,
): string | undefined {
  const labels: string[] = [];

  if (attention.role === 'anchor') labels.push('Connection anchor');
  else if (attention.anchorRelationshipRole === 'uses') labels.push('Anchor uses this');
  else if (attention.anchorRelationshipRole === 'used-by') labels.push('Uses the anchor');
  else if (attention.role === 'additional-context') labels.push('Additional context');
  if (!attention.selected && attention.role === 'direct' && attention.anchorRelationshipRole === 'unrelated') {
    if (attention.selectedRelationshipRole === 'uses') labels.push('Selected item uses this');
    else if (attention.selectedRelationshipRole === 'used-by') labels.push('Uses selected item');
  }
  if (attention.selected) labels.push(node.data.kind === 'territory' ? 'Selected for inspection' : 'Selected');

  return labels.length > 0 ? labels.join(' · ') : undefined;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
