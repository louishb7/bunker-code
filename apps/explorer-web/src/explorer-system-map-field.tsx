import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type {
  ExplorerSystemMapFrontierItem,
  ExplorerSystemMapFrontierProjection,
  ExplorerSystemMapFrontierRelation,
} from './explorer-system-map-frontier-projection.js';
import type { ExplorerSystemMapGeography } from './explorer-system-map-geography.js';
import {
  createSystemMapFieldModel,
  createSystemMapFieldRelationRoute,
  createSystemMapFieldSelection,
  systemMapFieldDimensions,
  type SystemMapFieldItemAttention,
  type SystemMapFieldHandleSide,
  type SystemMapFieldRelationDirection,
} from './explorer-system-map-field-model.js';

interface FieldNodeData extends Record<string, unknown> {
  item?: ExplorerSystemMapFrontierItem;
  kind: 'region' | 'file' | 'context';
  regionId?: string;
  parentId?: string;
  label: string;
  attention: SystemMapFieldItemAttention;
  onSelect?: () => void;
  onCollapse?: () => void;
}

interface FieldEdgeData extends Record<string, unknown> {
  relation: ExplorerSystemMapFrontierRelation;
  sourceLabel: string;
  targetLabel: string;
  direction?: SystemMapFieldRelationDirection;
  investigated: boolean;
}

type FieldNode = Node<FieldNodeData>;
type FieldEdge = Edge<FieldEdgeData>;

const nodeTypes = { fieldItem: FieldItemNode, fieldContext: FieldContextNode };
const edgeTypes = { fieldRelation: FieldRelationEdge };

export function ExplorerSystemMapField({
  projectLabel,
  projection,
  geography,
  refinedRegionIds,
  onExploreRegion,
  onCollapseRegion,
}: {
  projectLabel: string;
  projection: ExplorerSystemMapFrontierProjection;
  geography: ExplorerSystemMapGeography;
  refinedRegionIds: ReadonlySet<string>;
  onExploreRegion(regionId: string): void;
  onCollapseRegion(regionId: string): void;
}) {
  const model = useMemo(() => createSystemMapFieldModel(projection, { geography, refinedRegionIds }), [projection, geography, refinedRegionIds]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const selection = useMemo(
    () => createSystemMapFieldSelection(model, selectedItemId),
    [model, selectedItemId],
  );
  const itemsById = useMemo(() => new Map(projection.items.map((item) => [item.id, item] as const)), [projection.items]);
  useEffect(() => {
    if (selectedItemId && !itemsById.has(selectedItemId)) setSelectedItemId(null);
    if (selectedRelationId && !projection.relations.some((relation) => relation.id === selectedRelationId)) setSelectedRelationId(null);
  }, [itemsById, projection.relations, selectedItemId, selectedRelationId]);
  const nodes = useMemo(() => createFieldNodes(
    model,
    selection.itemAttention,
    (item) => {
      setSelectedRelationId(null);
      setSelectedItemId(item.id);
    },
    onCollapseRegion,
  ), [model, selection.itemAttention, onCollapseRegion]);
  const edges = useMemo(() => model.relations.map((relation): FieldEdge => {
    const direction = selection.relationDirections.get(relation.id);
    const route = createSystemMapFieldRelationRoute(model, relation);
    const source = itemsById.get(relation.sourceItemId);
    const target = itemsById.get(relation.targetItemId);
    if (!source || !target) throw new Error(`Territory Field relation references an unknown item: ${relation.id}`);
    return {
      id: relation.id,
      source: relation.sourceItemId,
      target: relation.targetItemId,
      sourceHandle: 'source-' + route.sourceSide,
      targetHandle: 'target-' + route.targetSide,
      type: 'fieldRelation',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: direction ? 18 : 13,
        height: direction ? 18 : 13,
        color: relationColor(direction),
      },
      ariaLabel: `${source.label} uses ${target.label}. ${relation.observedDependencyCount} observed internal file ${relation.observedDependencyCount === 1 ? 'dependency' : 'dependencies'}.`,
      focusable: true,
      selectable: true,
      zIndex: direction ? 3 : 1,
      data: {
        relation,
        sourceLabel: source.label,
        targetLabel: target.label,
        direction,
        investigated: selectedRelationId === relation.id,
      },
    };
  }), [itemsById, model, selectedRelationId, selection.relationDirections]);
  const selectedItem = selectedItemId ? itemsById.get(selectedItemId) : undefined;
  const selectedRelation = selectedRelationId
    ? projection.relations.find((relation) => relation.id === selectedRelationId)
    : undefined;
  const dependencyCount = projection.relations.reduce((total, relation) => total + relation.observedDependencyCount, 0);

  return (
    <section
      className="system-map system-map-field"
      data-system-map
      data-system-map-grammar="field"
      data-system-map-status="ready"
      data-system-map-item-count={projection.items.length}
      data-system-map-relation-count={projection.relations.length}
      data-system-map-dependency-count={dependencyCount}
      data-selected-system-map-item={selectedItemId ?? ''}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setSelectedItemId(null);
        setSelectedRelationId(null);
      }}
      aria-labelledby="system-map-field-title"
    >
      <header className="system-map-heading system-map-field-heading">
        <div>
          <p className="eyebrow">System Map · structural frontier</p>
          <h2 id="system-map-field-title">{projectLabel}</h2>
        </div>
        <dl className="system-map-summary" aria-label="System Map factual summary">
          <div><dt>Visual items</dt><dd>{projection.items.length}</dd></div>
          <div><dt>Directed relations</dt><dd>{projection.relations.length}</dd></div>
          <div><dt>File dependencies represented</dt><dd>{dependencyCount}</dd></div>
        </dl>
        <div className="system-map-field-key" aria-label="System Map selection legend">
          <span><i className="field-key-outgoing" />Uses</span>
          <span><i className="field-key-incoming" />Used by</span>
          <span>Uses / Used by = observed static dependencies</span>
          <span>Position is schematic only</span>
          <span>Frames contain refined regions · pan or fit to see more</span>
        </div>
      </header>
      <div className="system-map-field-workspace" data-primary-explorer-surface>
        <div className="system-map-canvas system-map-field-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 24, y: 28, zoom: 0.85 }}
            fitViewOptions={{ padding: 0.1, minZoom: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              if (!node.data.item) return;
              setSelectedRelationId(null);
              setSelectedItemId(node.data.item.id);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedItemId(null);
              setSelectedRelationId(edge.id);
            }}
            onPaneClick={() => {
              setSelectedItemId(null);
              setSelectedRelationId(null);
            }}
          >
            <Background color="#24343d" gap={36} size={0.65} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className="system-map-field-rail" aria-label="System Map inspector">
          {selectedItem ? (
            <FieldItemInspector
              item={selectedItem}
              relations={projection.relations}
              itemsById={itemsById}
              onExploreRegion={onExploreRegion}
              onInspectRelation={(relationId) => {
                setSelectedItemId(null);
                setSelectedRelationId(relationId);
              }}
            />
          ) : selectedRelation ? (
            <FieldRelationInspector relation={selectedRelation} itemsById={itemsById} />
          ) : (
            <FieldSystemSummary />
          )}
        </aside>
      </div>
    </section>
  );
}

function createFieldNodes(
  model: ReturnType<typeof createSystemMapFieldModel>,
  attention: Map<string, SystemMapFieldItemAttention>,
  onSelect: (item: ExplorerSystemMapFrontierItem) => void,
  onCollapse: (regionId: string) => void,
): FieldNode[] {
  return [
    ...model.frames.map((frame): FieldNode => ({
      id: frame.id,
      type: 'fieldContext',
      parentId: frame.parentId,
      extent: frame.parentId ? 'parent' : undefined,
      position: frame.position,
      style: { width: frame.width, height: frame.height },
      selectable: false,
      focusable: false,
      zIndex: -1,
      data: {
        kind: 'context', regionId: frame.region.id, parentId: frame.parentId,
        label: frame.region.workspacePackage?.name ?? frame.region.rootPath.split('/').at(-1) ?? frame.region.rootPath,
        attention: 'resting', onCollapse: () => onCollapse(frame.region.id),
      },
    })),
    ...model.items.map(({ item, position, parentId }): FieldNode => {
      return {
        id: item.id,
        type: 'fieldItem',
        position,
        parentId,
        extent: parentId ? 'parent' : undefined,
        style: systemMapFieldDimensions[item.kind],
        zIndex: attention.get(item.id) === 'selected' ? 5 : 2,
        data: {
          item,
          parentId,
          kind: item.kind,
          label: item.label,
          attention: attention.get(item.id) ?? 'resting',
          onSelect: () => onSelect(item),
        },
      };
    }),
  ];
}

function FieldItemNode({ data }: NodeProps<FieldNode>) {
  const item = data.item;
  if (!item) return null;
  const fileCount = item.kind === 'region' ? item.region.descendantFileIds.length : null;
  return (
    <div
      className={`system-map-field-item system-map-field-item-${data.kind} field-attention-${data.attention}`}
      data-system-map-item-kind={data.kind}
      data-system-map-item-id={item.id}
      data-system-map-parent-frame={data.parentId ?? ''}
      data-field-attention={data.attention}
    >
      <FieldHandles type="target" />
      <button
        type="button"
        className="nodrag nopan"
        aria-pressed={data.attention === 'selected'}
        aria-label={`${data.kind === 'region' ? 'Structural region' : 'Direct file'} ${data.label}`}
        onClick={data.onSelect}
      >
        {item.kind === 'region' ? <span>{item.region.workspacePackage ? 'Workspace package region' : 'Structural region'}</span> : null}
        <strong>{data.label}</strong>
        {fileCount !== null ? <small>{fileCount} analyzed file{fileCount === 1 ? '' : 's'}</small> : null}
      </button>
      <FieldHandles type="source" />
    </div>
  );
}

function FieldHandles({ type }: { type: 'source' | 'target' }) {
  const positions: Array<{ side: SystemMapFieldHandleSide; position: Position }> = [
    { side: 'top', position: Position.Top },
    { side: 'right', position: Position.Right },
    { side: 'bottom', position: Position.Bottom },
    { side: 'left', position: Position.Left },
  ];
  return positions.map(({ side, position }) => (
    <Handle key={side} id={type + '-' + side} type={type} position={position} />
  ));
}

function FieldContextNode({ data }: NodeProps<FieldNode>) {
  return (
    <section className="system-map-field-context" data-system-map-context-frame={data.regionId}
      data-system-map-parent-frame={data.parentId ?? ''} aria-label={`Refined region ${data.label}`}>
      <header>
        <div><small>Refined region</small><strong>{data.label}</strong></div>
        <button type="button" className="nodrag nopan" aria-label={`Collapse ${data.label}`} onClick={(event) => {
          event.stopPropagation();
          data.onCollapse?.();
        }}>Collapse</button>
      </header>
    </section>
  );
}

function FieldRelationEdge(props: EdgeProps<FieldEdge>) {
  const [path, labelX, labelY] = getBezierPath(props);
  const direction = props.data?.direction;
  const investigated = props.data?.investigated ?? false;
  const className = direction ? `field-relation field-relation-${direction}` : investigated ? 'field-relation field-relation-investigated' : 'field-relation field-relation-resting';
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        interactionWidth={props.interactionWidth}
        className={className}
        style={{ stroke: relationColor(direction), strokeWidth: direction || investigated ? 2.5 : 0.85 }}
      />
      {investigated ? (
        <EdgeLabelRenderer>
          <div className="system-map-field-edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {props.data?.relation.observedDependencyCount} observed
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function FieldItemInspector({
  item,
  relations,
  itemsById,
  onExploreRegion,
  onInspectRelation,
}: {
  item: ExplorerSystemMapFrontierItem;
  relations: ExplorerSystemMapFrontierRelation[];
  itemsById: Map<string, ExplorerSystemMapFrontierItem>;
  onExploreRegion(regionId: string): void;
  onInspectRelation(relationId: string): void;
}) {
  const outgoing = relations.filter((relation) => relation.sourceItemId === item.id);
  const incoming = relations.filter((relation) => relation.targetItemId === item.id);
  return (
    <div className="system-map-field-inspector" data-system-map-field-inspector={item.id} aria-live="polite">
      <div><span>{item.kind === 'region' ? 'Structural region' : 'Direct file'}</span><strong>{item.label}</strong></div>
      {item.kind === 'region' ? <p>{item.region.workspacePackage
        ? `Workspace package identity: ${item.region.workspacePackage.name}`
        : `Observed structural location: ${item.region.rootPath}`}</p> : null}
      <section className="system-map-field-inspector-section" aria-labelledby="structural-connections-title">
        <h3 id="structural-connections-title">Structural connections</h3>
        <RelationList label="Uses" direction="outgoing" relations={outgoing} itemsById={itemsById} onInspect={onInspectRelation} />
        <RelationList label="Used by" direction="incoming" relations={incoming} itemsById={itemsById} onInspect={onInspectRelation} />
      </section>
      {item.kind === 'region' ? (
        <button type="button" onClick={() => onExploreRegion(item.region.id)}>
          Explore region
        </button>
      ) : null}
    </div>
  );
}

function FieldSystemSummary() {
  return (
    <div className="system-map-field-summary">
      <div className="system-map-field-empty-inspector">
        <span>System Map inspector</span>
        <p>Select a structural region or direct file to inspect its connections.</p>
        <p>Responsibility overlays and System context are not yet projected at this frontier scale.</p>
      </div>
    </div>
  );
}

function RelationList({ label, direction, relations, itemsById, onInspect }: {
  label: string;
  direction: SystemMapFieldRelationDirection;
  relations: ExplorerSystemMapFrontierRelation[];
  itemsById: Map<string, ExplorerSystemMapFrontierItem>;
  onInspect(relationId: string): void;
}) {
  return (
    <section data-field-relation-group={direction}>
      <h3>{label}</h3>
      {relations.length === 0 ? <p>None observed</p> : <ul>{relations.map((relation) => {
        const relatedId = direction === 'outgoing' ? relation.targetItemId : relation.sourceItemId;
        return <li key={relation.id}><button type="button" onClick={() => onInspect(relation.id)}><span>{itemsById.get(relatedId)?.label}</span><small>{relation.observedDependencyCount} observed</small></button></li>;
      })}</ul>}
    </section>
  );
}

function FieldRelationInspector({ relation, itemsById }: {
  relation: ExplorerSystemMapFrontierRelation;
  itemsById: Map<string, ExplorerSystemMapFrontierItem>;
}) {
  return (
    <div className="system-map-field-inspector system-map-field-relation-inspector" data-system-map-field-relation={relation.id} aria-live="polite">
      <div><span>Observed relation</span><strong>{itemsById.get(relation.sourceItemId)?.label} uses {itemsById.get(relation.targetItemId)?.label}</strong></div>
      <p>{relation.observedDependencyCount} internal file {relation.observedDependencyCount === 1 ? 'dependency' : 'dependencies'}</p>
      <details>
        <summary>How BunkerCode knows</summary>
        <ul>{relation.fileEdges.map((edge) => <li key={edge.id}>
          <code>{edge.sourceNodeId}</code> uses <code>{edge.targetNodeId}</code>
          <span>{edge.evidence.location.filePath}:{edge.evidence.location.line}:{edge.evidence.location.column} · {edge.confidence}</span>
        </li>)}</ul>
      </details>
    </div>
  );
}

function relationColor(direction?: SystemMapFieldRelationDirection): string {
  return direction === 'outgoing' ? '#6eb7df' : direction === 'incoming' ? '#73c8bb' : '#607782';
}
