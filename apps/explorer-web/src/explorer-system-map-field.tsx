import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  ReactFlowProvider,
  useReactFlow,
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
  onRefine?: () => void;
  onFocus?: () => void;
  path?: string;
  passive?: boolean;
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

interface FieldProps {
  projectLabel: string;
  projection: ExplorerSystemMapFrontierProjection;
  geography: ExplorerSystemMapGeography;
  refinedRegionIds: ReadonlySet<string>;
  onExploreRegion(regionId: string): void;
  onCollapseRegion(regionId: string): void;
}

export function ExplorerSystemMapField(props: FieldProps) {
  return <ReactFlowProvider><SystemMapField {...props} /></ReactFlowProvider>;
}

function SystemMapField({
  projectLabel,
  projection,
  geography,
  refinedRegionIds,
  onExploreRegion,
  onCollapseRegion,
}: FieldProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pendingNavigationFocus = useRef<string | null>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(1360);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 700 });
  const [cameraRequest, setCameraRequest] = useState<{ regionId: string | null; revision: number; explicit: boolean }>({ regionId: null, revision: 0, explicit: false });
  const [cameraReady, setCameraReady] = useState(false);
  const [flowReady, setFlowReady] = useState(false);
  const [showAllRelations, setShowAllRelations] = useState(false);
  const flow = useReactFlow<FieldNode, FieldEdge>();
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (workspaceRef.current) setWorkspaceWidth(workspaceRef.current.clientWidth);
      if (canvasRef.current) setCanvasSize({ width: canvasRef.current.clientWidth, height: canvasRef.current.clientHeight });
    });
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);
  const model = useMemo(() => createSystemMapFieldModel(projection, { geography, refinedRegionIds, viewportWidth: workspaceWidth }), [projection, geography, refinedRegionIds, workspaceWidth]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const selection = useMemo(
    () => createSystemMapFieldSelection(model, selectedItemId),
    [model, selectedItemId],
  );
  const itemsById = useMemo(() => new Map(projection.items.map((item) => [item.id, item] as const)), [projection.items]);
  const focusFrame = model.frames.find((frame) => frame.region.id === cameraRequest.regionId);
  const breadcrumbs = [];
  let breadcrumbFrame = focusFrame;
  while (breadcrumbFrame) {
    breadcrumbs.unshift(breadcrumbFrame);
    breadcrumbFrame = model.frames.find((frame) => frame.id === breadcrumbFrame?.parentId);
  }
  function focusRegion(regionId: string | null, explicit = true) {
    setCameraRequest((current) => ({ regionId, revision: current.revision + 1, explicit }));
  }
  function refineRegion(regionId: string) {
    setSelectedItemId(null);
    setSelectedRelationId(null);
    focusRegion(regionId, false);
    pendingNavigationFocus.current = `[data-system-map-collapse="${CSS.escape(regionId)}"]`;
    onExploreRegion(regionId);
  }
  function collapseRegion(regionId: string) {
    const parent = model.frames.find((frame) => frame.id === model.frames.find((frame) => frame.region.id === regionId)?.parentId);
    focusRegion(parent?.region.id ?? null, false);
    pendingNavigationFocus.current = `[data-system-map-refine="${CSS.escape(regionId)}"]`;
    onCollapseRegion(regionId);
  }
  useEffect(() => {
    if (!cameraReady || !pendingNavigationFocus.current) return;
    const control = workspaceRef.current?.querySelector<HTMLButtonElement>(pendingNavigationFocus.current);
    if (!control) return;
    control.focus({ preventScroll: true });
    pendingNavigationFocus.current = null;
  }, [model, cameraReady]);
  useEffect(() => {
    if (!flowReady) return;
    let cancelled = false;
    setCameraReady(false);
    const all = model.bounds;
    const overviewZoom = Math.min(canvasSize.width / (all.width + 80), canvasSize.height / (all.height + 80));
    const frame = model.frames.find((candidate) => candidate.region.id === cameraRequest.regionId);
    const bounds = frame && (cameraRequest.explicit || overviewZoom < 0.8)
      ? { x: frame.absolutePosition.x - 36, y: frame.absolutePosition.y - 50, width: frame.width + 72, height: frame.height + 100 }
      : all;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    void flow.fitBounds(bounds, { padding: 0.12, duration }).then(() => {
      if (!cancelled) setCameraReady(true);
    });
    return () => { cancelled = true; };
  }, [flow, flowReady, model, cameraRequest, canvasSize]);
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
    collapseRegion,
    refineRegion,
    focusRegion,
  ), [model, selection.itemAttention, onCollapseRegion, onExploreRegion]);
  const edges = useMemo(() => model.relations.map((relation): FieldEdge => {
    const direction = selection.relationDirections.get(relation.id);
    const investigated = selectedRelationId === relation.id;
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
      hidden: !showAllRelations && !direction && !investigated,
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
        investigated,
      },
    };
  }), [itemsById, model, selectedRelationId, selection.relationDirections, showAllRelations]);
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
      data-map-camera-ready={cameraReady}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setSelectedItemId(null);
        setSelectedRelationId(null);
      }}
      aria-labelledby="system-map-field-title"
    >
      <header className="system-map-heading system-map-field-heading">
        <div>
          <p className="eyebrow">System Map · Structure</p>
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
          <label><input type="checkbox" checked={showAllRelations} onChange={(event) => setShowAllRelations(event.target.checked)} /> All dependencies</label>
        </div>
      </header>
      <nav className="system-map-scale-trail" aria-label="Map scale">
        <button type="button" onClick={() => focusRegion(null)}>System · fit all</button>
        {breadcrumbs.map((frame) => <span key={frame.id}> / <button type="button" onClick={() => focusRegion(frame.region.id)}>{frame.region.workspacePackage?.name ?? frame.region.rootPath}</button></span>)}
        <small>Zoom in to explore · select a landmark to inspect connections</small>
      </nav>
      <div ref={workspaceRef} className={`system-map-field-workspace ${selectedItem || selectedRelation ? 'has-inspector' : ''}`} data-primary-explorer-surface>
        <div ref={canvasRef} className="system-map-canvas system-map-field-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 24, y: 28, zoom: 0.85 }}
            fitViewOptions={{ padding: 0.1, minZoom: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.15}
            onInit={() => setFlowReady(true)}
            zoomOnDoubleClick={false}
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
        {selectedItem || selectedRelation ? <aside className="system-map-field-rail" aria-label="System Map inspector">
          <button className="system-map-close-inspector" type="button" onClick={() => { setSelectedItemId(null); setSelectedRelationId(null); }}>Close inspector</button>
          {selectedItem ? (
            <FieldItemInspector
              item={selectedItem}
              relations={projection.relations}
              itemsById={itemsById}
              onInspectRelation={(relationId) => {
                setSelectedItemId(null);
                setSelectedRelationId(relationId);
              }}
            />
          ) : selectedRelation ? (
            <FieldRelationInspector relation={selectedRelation} itemsById={itemsById} />
          ) : (
            null
          )}
        </aside> : null}
      </div>
    </section>
  );
}

function createFieldNodes(
  model: ReturnType<typeof createSystemMapFieldModel>,
  attention: Map<string, SystemMapFieldItemAttention>,
  onSelect: (item: ExplorerSystemMapFrontierItem) => void,
  onCollapse: (regionId: string) => void,
  onRefine: (regionId: string) => void,
  onFocus: (regionId: string) => void,
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
        path: frame.region.rootPath, passive: frame.passive,
        label: frame.region.workspacePackage?.name ?? frame.region.rootPath.split('/').at(-1) ?? frame.region.rootPath,
        attention: 'resting', onCollapse: () => onCollapse(frame.region.id), onFocus: () => onFocus(frame.region.id),
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
          onRefine: item.kind === 'region' ? () => onRefine(item.region.id) : undefined,
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
        className="system-map-landmark-select nodrag nopan"
        aria-pressed={data.attention === 'selected'}
        aria-label={`${data.kind === 'region' ? 'Structural region' : 'Direct file'} ${data.label}`}
        onClick={data.onSelect}
        onDoubleClick={data.onRefine}
      >
        {item.kind === 'region' ? <span>{item.region.workspacePackage ? 'Workspace package region' : 'Structural region'}</span> : null}
        <strong>{data.label}</strong>
        {fileCount !== null ? <small>{fileCount} analyzed file{fileCount === 1 ? '' : 's'}</small> : null}
      </button>
      {item.kind === 'region' ? <button type="button" className="system-map-refine nodrag nopan"
        data-system-map-refine={item.region.id} aria-label={`Zoom in ${data.label}`}
        onClick={(event) => { event.stopPropagation(); data.onRefine?.(); }}>Zoom in <span aria-hidden="true">↗</span></button> : null}
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
    <section className={`system-map-field-context ${data.passive ? 'field-context-passive' : ''}`} data-system-map-context-frame={data.regionId}
      data-system-map-frame-kind={data.passive ? 'wrapper' : 'refined'}
      data-system-map-parent-frame={data.parentId ?? ''} aria-label={`${data.passive ? 'Folder context' : 'Expanded region'} ${data.label}`}>
      <header>
        <div><small>{data.passive ? 'Folder context' : 'Expanded region'} · {data.path}</small><strong>{data.label}</strong></div>
        <div className="system-map-frame-actions">
        <button type="button" className="nodrag nopan" aria-label={`Focus ${data.path}`} onClick={data.onFocus}>Focus</button>
        {!data.passive ? <button type="button" className="nodrag nopan" data-system-map-collapse={data.regionId} aria-label={`Collapse ${data.label}`} onClick={(event) => {
          event.stopPropagation();
          data.onCollapse?.();
        }}>Collapse ↑</button> : null}
        </div>
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
  onInspectRelation,
}: {
  item: ExplorerSystemMapFrontierItem;
  relations: ExplorerSystemMapFrontierRelation[];
  itemsById: Map<string, ExplorerSystemMapFrontierItem>;
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
