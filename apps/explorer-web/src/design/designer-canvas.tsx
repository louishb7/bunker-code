import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MarkerType, Position,
  ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import type { PlannedSubjectRef, PlannedSystemModel } from '@bunker-code/contracts';
import { partPosition, partSize } from './designer-layout.js';
import type { DesignerPresentation } from './designer-storage.js';

type PartNode = Node<{ label: string; description: string; annotations: number }, 'plannedPart'>;
type RelationEdge = Edge<{ label: string; lane: number; self: boolean; labelOffset: number; routeTop?: number; select(): void }, 'plannedRelation'>;
const nodeTypes = { plannedPart: PartCard };
const edgeTypes = { plannedRelation: RelationLine };

function PartCard({ data, selected }: NodeProps<PartNode>) {
  return <div className={`designer-part ${selected ? 'is-selected' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <span className="designer-part-kind">PART {data.annotations > 0 && <span>· {data.annotations} notes</span>}</span>
    <strong title={data.label}>{data.label}</strong>
    <span className="designer-part-description" title={data.description}>{data.description}</span>
    <Handle type="source" position={Position.Right} />
  </div>;
}
function relationGeometry(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number, self: boolean, routeTop?: number) {
  let path: string; let x: number; let y: number;
  if (self) {
    const top = sourceY - 110 - lane * 44;
    path = `M ${sourceX} ${sourceY} C ${sourceX + 90} ${top}, ${targetX - 90} ${top}, ${targetX} ${targetY}`;
    x = (sourceX + targetX) / 2; y = sourceY + (top - sourceY) * 0.75;
  } else if (routeTop !== undefined || targetX < sourceX) {
    const top = routeTop ?? Math.min(sourceY, targetY) - 100 - (Math.abs(lane) * 2 + (lane < 0 ? 1 : 0)) * 56;
    if (targetX > sourceX) {
      const bend = Math.min(48, (targetX - sourceX) / 4);
      path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${sourceX + bend} ${top}, ${sourceX + bend * 2} ${top} L ${targetX - bend * 2} ${top} C ${targetX - bend} ${top}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`;
    } else {
      path = `M ${sourceX} ${sourceY} C ${sourceX + 90} ${sourceY}, ${sourceX + 90} ${top}, ${sourceX} ${top} L ${targetX} ${top} C ${targetX - 90} ${top}, ${targetX - 90} ${targetY}, ${targetX} ${targetY}`;
    }
    x = (sourceX + targetX) / 2; y = top;
  } else {
    const middleX = (sourceX + targetX) / 2;
    const offset = lane * 56;
    const bend = Math.max(80, Math.abs(targetX - sourceX) * 0.45);
    path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY + offset}, ${targetX - bend} ${targetY + offset}, ${targetX} ${targetY}`;
    x = middleX; y = (sourceY + targetY) / 2 + offset * 0.75;
  }
  return { path, x, y };
}
function RelationLine({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, selected }: EdgeProps<RelationEdge>) {
  const { path, x, y } = relationGeometry(sourceX, sourceY, targetX, targetY, data?.lane ?? 0, data?.self ?? false, data?.routeTop);
  const labelY = y + (data?.labelOffset ?? 0);
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={24} style={{ stroke: selected ? '#e4cf9f' : '#8da9b5', strokeWidth: selected ? 3 : 1.7 }} />
    {labelY !== y && <path d={`M ${x} ${y} L ${x} ${labelY}`} stroke="#8da9b5" strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />}
    <EdgeLabelRenderer><button type="button" onClick={data?.select} title={data?.label} aria-label={`Inspect Relation: ${data?.label}`} className={`designer-edge-label nodrag nopan ${selected ? 'is-selected' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${x}px, ${labelY}px)` }}>{data?.label}</button></EdgeLabelRenderer>
  </>;
}
interface CanvasProps {
  model: PlannedSystemModel;
  presentation: DesignerPresentation;
  selection: PlannedSubjectRef;
  onSelect(subject: PlannedSubjectRef): void;
  onConnect(source: string, target: string): void;
  onPresentation(presentation: DesignerPresentation): boolean;
  onError(message: string): void;
  addPart(): void;
  focusRequest: { id: string; revision: number } | null;
}
export function DesignerCanvas(props: CanvasProps) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}
function Canvas({ model, presentation, selection, onSelect, onConnect, onPresentation, onError, addPart, focusRequest }: CanvasProps) {
  const flow = useReactFlow<PartNode, RelationEdge>();
  const [nodes, setNodes] = useState<PartNode[]>([]);
  const [arranging, setArranging] = useState(false);
  const previousParts = useRef(new Set(model.parts.map((part) => part.id)));
  const latest = useRef({ model, presentation });
  latest.current = { model, presentation };
  useEffect(() => {
    const addedIndex = model.parts.findIndex((part) => !previousParts.current.has(part.id));
    previousParts.current = new Set(model.parts.map((part) => part.id));
    const nextNodes: PartNode[] = model.parts.map((part, index) => ({
      id: part.id, type: 'plannedPart',
      position: partPosition(presentation, part.id, index),
      selected: selection.kind === 'part' && selection.partId === part.id,
      data: { label: part.label, description: part.description ?? '', annotations: [...model.claims, ...model.openQuestions].filter((item) => item.subject.kind === 'part' && item.subject.partId === part.id).length },
    }));
    setNodes(nextNodes);
    const addedNode = nextNodes[addedIndex];
    if (addedNode) void flow.setCenter(addedNode.position.x + 110, addedNode.position.y + 56, { zoom: Math.min(flow.getZoom(), 1) });
  }, [model, presentation.positions, selection, flow]);
  useEffect(() => {
    if (!focusRequest) return;
    const index = model.parts.findIndex((part) => part.id === focusRequest.id);
    if (index < 0) return;
    const point = partPosition(presentation, focusRequest.id, index);
    void flow.setCenter(point.x + partSize.width / 2, point.y + partSize.height / 2, { zoom: 1 });
  }, [focusRequest, flow]);
  const edges = useMemo<RelationEdge[]>(() => {
    const labels: { x: number; y: number; width: number }[] = [];
    return model.relations.map((relation) => {
      const siblings = model.relations.filter((item) => (item.sourcePartId === relation.sourcePartId && item.targetPartId === relation.targetPartId) || (item.sourcePartId === relation.targetPartId && item.targetPartId === relation.sourcePartId));
      const index = siblings.findIndex((item) => item.id === relation.id);
      const lane = relation.sourcePartId === relation.targetPartId ? index : index - (siblings.length - 1) / 2;
      const self = relation.sourcePartId === relation.targetPartId;
      const source = partPosition(presentation, relation.sourcePartId, model.parts.findIndex((part) => part.id === relation.sourcePartId));
      const target = partPosition(presentation, relation.targetPartId, model.parts.findIndex((part) => part.id === relation.targetPartId));
      const corridor = model.parts.map((part, index) => ({ id: part.id, ...partPosition(presentation, part.id, index) }))
        .filter((point) => point.id !== relation.sourcePartId && point.id !== relation.targetPartId)
        .filter((point) => point.x + partSize.width > Math.min(source.x + partSize.width, target.x) && point.x < Math.max(source.x + partSize.width, target.x));
      const obstructed = corridor.some((point) => point.y < Math.max(source.y, target.y) + partSize.height && point.y + partSize.height > Math.min(source.y, target.y));
      const routeTop = !self && (target.x < source.x + partSize.width || obstructed)
        ? Math.min(source.y, target.y, ...corridor.map((point) => point.y)) - 64 - (Math.abs(lane) * 2 + (lane < 0 ? 1 : 0)) * 40
        : undefined;
      const label = model.predicates.find((item) => item.id === relation.predicateId)?.label ?? '';
      const anchor = relationGeometry(source.x + partSize.width, source.y + partSize.height / 2, target.x, target.y + partSize.height / 2, lane, self, routeTop);
      const width = Math.min(190, label.length * 7 + 20);
      let labelOffset = 0;
      while (labels.some((other) => Math.abs(other.x - anchor.x) < (width + other.width) / 2 + 8 && Math.abs(other.y - anchor.y - labelOffset) < 32)) labelOffset -= 32;
      labels.push({ x: anchor.x, y: anchor.y + labelOffset, width });
      return {
        id: relation.id, type: 'plannedRelation', source: relation.sourcePartId, target: relation.targetPartId,
        selected: selection.kind === 'relation' && selection.relationId === relation.id,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8da9b5', width: 22, height: 22 },
        data: { label, lane, self, labelOffset, routeTop, select: () => onSelect({ kind: 'relation', relationId: relation.id }) },
      };
    });
  }, [model, presentation.positions, selection, onSelect]);
  async function arrange() {
    setArranging(true);
    const sourceModel = model;
    const sourcePositions = presentation.positions;
    try {
      const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
      const result = await new ELK().layout({
        id: 'planned-layout', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '64', 'elk.layered.spacing.nodeNodeBetweenLayers': '110' },
        children: model.parts.map((part) => ({ id: part.id, ...partSize })),
        edges: model.relations.map((relation) => ({ id: relation.id, sources: [relation.sourcePartId], targets: [relation.targetPartId] })),
      });
      if (latest.current.model !== sourceModel || JSON.stringify(latest.current.presentation.positions) !== JSON.stringify(sourcePositions)) { onError('Arrangement cancelled because the system changed. Try Auto arrange again.'); return; }
      const positions = Object.fromEntries((result.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
      if (onPresentation({ positions })) requestAnimationFrame(() => { void flow.fitView({ padding: 0.12, maxZoom: 1 }); });
    } catch (error) { onError(`Layout failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setArranging(false); }
  }
  return <section className="designer-canvas" aria-label="Planned system canvas" data-designer-canvas>
    <div className="designer-map-tools">
      <span>{model.parts.length} Parts <span aria-hidden="true">·</span> {model.relations.length} Relations</span>
      <button onClick={() => { void arrange(); }} disabled={arranging || !nodes.length}>{arranging ? 'Arranging…' : 'Auto arrange'}</button>
      <button onClick={() => { void flow.fitView({ padding: 0.12, maxZoom: 1 }); }} disabled={!nodes.length}>Fit system</button>
    </div>
    {!model.parts.length && <div className="designer-canvas-empty"><span className="eyebrow">A system starts with an idea</span><h2>What are its Parts?</h2><p>Add a Part, then connect it to another.<br />Give each connection a meaning in your own words.</p><button className="designer-primary" onClick={addPart}>+ Add your first Part</button><small>or press N</small></div>}
    <ReactFlow<PartNode, RelationEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
      onNodeClick={(_, node) => onSelect({ kind: 'part', partId: node.id })}
      onEdgeClick={(_, edge) => onSelect({ kind: 'relation', relationId: edge.id })}
      onPaneClick={() => onSelect({ kind: 'model' })}
      onConnect={(connection) => { if (connection.source && connection.target) onConnect(connection.source, connection.target); }}
      onNodeDragStop={(_, node) => { if (!onPresentation({ ...latest.current.presentation, positions: { ...latest.current.presentation.positions, [node.id]: node.position } })) setNodes((current) => current.map((item, index) => ({ ...item, position: partPosition(latest.current.presentation, item.id, index) }))); }}
      onMoveEnd={(_, viewport) => { onPresentation({ ...latest.current.presentation, viewport }); }}
      defaultViewport={presentation.viewport} fitView={!presentation.viewport} fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
      minZoom={0.1} maxZoom={3} deleteKeyCode={null} colorMode="dark" proOptions={{ hideAttribution: true }}>
      <Background color="#30424c" gap={24} size={1} /><Controls showInteractive={false} showFitView={false} />
    </ReactFlow>
    <div className="designer-map-hint">Source → predicate → target · Drag Parts to arrange · Scroll to zoom</div>
  </section>;
}
