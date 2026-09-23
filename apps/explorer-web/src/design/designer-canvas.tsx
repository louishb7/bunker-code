import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MarkerType, Position,
  ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import type { PlannedSubjectRef, PlannedSystemModel } from '@bunker-code/contracts';
import { buildDesignerScene, relationGeometry, technologyBadges } from './designer-scene.js';
import type { DesignImplementation } from './designer-implementation.js';
import { partPosition, dimensionsForLens } from './designer-layout.js';
import type { DesignerPresentation } from './designer-storage.js';

type PartNode = Node<{ label: string; description: string; annotations: number; technologies: string[]; implementationLens: boolean; height: number }, 'plannedPart'>;
type RelationEdge = Edge<{ label: string; lane: number; self: boolean; labelOffset: number; routeTop?: number; select(): void }, 'plannedRelation'>;
const nodeTypes = { plannedPart: PartCard };
const edgeTypes = { plannedRelation: RelationLine };

function PartCard({ data, selected }: NodeProps<PartNode>) {
  return <div title={data.implementationLens ? data.technologies.join(' · ') || 'No technologies chosen' : undefined} style={{ height: data.height }} className={`designer-part ${data.implementationLens ? 'with-implementation' : ''} ${selected ? 'is-selected' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <span className="designer-part-kind">PART {data.annotations > 0 && <span>· {data.annotations} notes</span>}</span>
    <strong title={data.label}>{data.label}</strong>
    {!data.implementationLens && <span className="designer-part-description" title={data.description}>{data.description}</span>}
    {data.implementationLens && <div className="designer-node-implementation" aria-label="Planned technologies">
      {data.technologies.length ? technologyBadges(data.technologies).map((badge, index) => <span className="designer-tech-chip" key={index} title={badge.label} style={{ left: badge.x, top: badge.y, width: badge.width }}>{badge.text}</span>) : <span className="designer-no-technology">No technologies chosen</span>}
    </div>}
    <Handle type="source" position={Position.Right} />
  </div>;
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
  implementation: DesignImplementation;
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
function Canvas({ model, presentation, selection, onSelect, onConnect, onPresentation, onError, addPart, focusRequest, implementation }: CanvasProps) {
  const partSize = dimensionsForLens(presentation);
  const scene = useMemo(() => buildDesignerScene(model, presentation, implementation), [model, presentation.positions, presentation.lens, implementation]);
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
      data: { technologies: scene.parts[index]?.technologies ?? [], implementationLens: presentation.lens === 'implementation', height: partSize.height, label: part.label, description: part.description ?? '', annotations: [...model.claims, ...model.openQuestions].filter((item) => item.subject.kind === 'part' && item.subject.partId === part.id).length },
    }));
    setNodes(nextNodes);
    const addedNode = nextNodes[addedIndex];
    if (addedNode) void flow.setCenter(addedNode.position.x + partSize.width / 2, addedNode.position.y + partSize.height / 2, { zoom: Math.min(flow.getZoom(), 1) });
  }, [model, presentation.positions, selection, flow, scene]);
  useEffect(() => {
    if (!focusRequest) return;
    const index = model.parts.findIndex((part) => part.id === focusRequest.id);
    if (index < 0) return;
    const point = partPosition(presentation, focusRequest.id, index);
    void flow.setCenter(point.x + partSize.width / 2, point.y + partSize.height / 2, { zoom: 1 });
  }, [focusRequest, flow]);
  const edges = useMemo<RelationEdge[]>(() => scene.relations.map((relation) => ({
    id: relation.id, type: 'plannedRelation', source: relation.source, target: relation.target,
    selected: selection.kind === 'relation' && selection.relationId === relation.id,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8da9b5', width: 22, height: 22 },
    data: { ...relation, select: () => onSelect({ kind: 'relation', relationId: relation.id }) },
  })), [scene, selection, onSelect]);
  async function arrange() {
    setArranging(true);
    const sourceModel = model;
    const sourcePositions = presentation.positions;
    try {
      const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
      const result = await new ELK().layout({
        id: 'planned-layout', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '64', 'elk.layered.spacing.nodeNodeBetweenLayers': '110' },
        // Reserve space for either lens so switching views preserves a readable layout.
        children: model.parts.map((part) => ({ id: part.id, ...dimensionsForLens({ lens: 'implementation' }) })),
        edges: model.relations.map((relation) => ({ id: relation.id, sources: [relation.sourcePartId], targets: [relation.targetPartId] })),
      });
      if (latest.current.model !== sourceModel || JSON.stringify(latest.current.presentation.positions) !== JSON.stringify(sourcePositions)) { onError('Arrangement cancelled because the system changed. Try Auto arrange again.'); return; }
      const positions = Object.fromEntries((result.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
      if (onPresentation({ ...latest.current.presentation, positions })) requestAnimationFrame(() => { void flow.fitView({ padding: 0.12, maxZoom: 1 }); });
    } catch (error) { onError(`Layout failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setArranging(false); }
  }
  return <section className="designer-canvas" aria-label="Planned system canvas" data-designer-canvas>
    <div className="designer-lens" role="group" aria-label="Canvas lens">
      <button aria-pressed={presentation.lens !== 'implementation'} onClick={() => onPresentation({ ...presentation, lens: 'structure' })}>Structure</button>
      <button aria-pressed={presentation.lens === 'implementation'} onClick={() => onPresentation({ ...presentation, lens: 'implementation' })}>Implementation</button>
    </div>
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
