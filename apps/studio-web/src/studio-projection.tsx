import { useEffect, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeToolbar, Handle, MarkerType, NodeToolbar, Position, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { CONSIDERATIONS, type DesignDocument, type DesignEntity, type DesignRelationship, type LayoutDocument } from "@bunker-code/design-model";

export const KIND_LABELS = { component: "Component", boundary: "Boundary", "data-store": "Data store", "queue-event": "Queue / Event", "external-system": "External system", actor: "Actor" } as const;
export const KIND_ICONS = { component: "◇", boundary: "▱", "data-store": "▣", "queue-event": "⇄", "external-system": "↗", actor: "◌" } as const;
export const RELATIONSHIP_LABELS = { generic: "Generic", calls: "Calls", "depends-on": "Depends on", protects: "Protects", "reads-writes": "Reads / writes", emits: "Emits", consumes: "Consumes" } as const;

type NodeAction = "details" | "considerations" | "decision" | "duplicate";
export type StudioNodeData = {
  entity: DesignEntity;
  connections: Array<{ direction: "in" | "out"; name: string; kind: string }>;
  editing: boolean;
  onRename: (id: string, name: string) => void;
  onCancelRename: (id: string) => void;
  onAction: (id: string, action: NodeAction) => void;
};
export type StudioNode = Node<StudioNodeData, "concept">;
export type StudioEdgeData = { relationship: DesignRelationship; sourceName: string; targetName: string; onAction: (id: string, action: "edit" | "delete") => void };
export type StudioEdge = Edge<StudioEdgeData, "relationship">;

export function projectNodes(design: DesignDocument, layout: LayoutDocument, selectedId: string | null, editingId: string | null,
  onRename: StudioNodeData["onRename"], onCancelRename: StudioNodeData["onCancelRename"], onAction: StudioNodeData["onAction"]): StudioNode[] {
  return design.entities.map((entity) => {
    const position = layout.nodes.find((node) => node.entityId === entity.id);
    if (!position) throw new Error(`Missing position for ${entity.id}.`);
    const connections = design.relationships.filter((relationship) => relationship.sourceEntityId === entity.id || relationship.targetEntityId === entity.id).map((relationship) => {
      const direction: "out" | "in" = relationship.sourceEntityId === entity.id ? "out" : "in";
      const otherId = direction === "out" ? relationship.targetEntityId : relationship.sourceEntityId;
      return { direction, name: design.entities.find((candidate) => candidate.id === otherId)?.name ?? "Unknown", kind: RELATIONSHIP_LABELS[relationship.kind] };
    });
    return { id: entity.id, type: "concept", position: { x: position.x, y: position.y }, selected: selectedId === entity.id,
      data: { entity, connections, editing: editingId === entity.id, onRename, onCancelRename, onAction } };
  });
}
export function projectEdges(design: DesignDocument, selectedId: string | null, onAction: StudioEdgeData["onAction"]): StudioEdge[] {
  return design.relationships.map((relationship) => ({ id: relationship.id, type: "relationship", source: relationship.sourceEntityId, target: relationship.targetEntityId,
    sourceHandle: "out-bottom", targetHandle: "in-top", selected: selectedId === relationship.id, markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: "#8d97a7" },
    data: { relationship, sourceName: design.entities.find((entity) => entity.id === relationship.sourceEntityId)?.name ?? "Unknown",
      targetName: design.entities.find((entity) => entity.id === relationship.targetEntityId)?.name ?? "Unknown", onAction } }));
}

export function ConceptNode({ data, selected }: NodeProps<StudioNode>) {
  const { entity, connections, editing, onRename, onCancelRename, onAction } = data;
  const [draft, setDraft] = useState(entity.name);
  useEffect(() => { if (editing) setDraft(entity.name === "Untitled" ? "" : entity.name); }, [editing, entity.name]);
  const outstanding = CONSIDERATIONS[entity.kind].filter((item) => (entity.considerationStates[item.id] ?? "unreviewed") === "unreviewed").length;
  const openDecisions = entity.decisions.filter((decision) => decision.status === "open").length;
  return <>
    <div className={`concept-node kind-${entity.kind} ${selected ? "is-selected" : ""}`}>
      <Handle id="in-top" type="target" position={Position.Top} className="concept-handle" />
      <Handle id="in-left" type="target" position={Position.Left} className="concept-handle" />
      <div className="concept-heading"><span className="concept-icon" aria-hidden="true">{KIND_ICONS[entity.kind]}</span>
        {editing ? <input className="concept-name-input nodrag nowheel" autoFocus aria-label="Concept name" value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") onRename(entity.id, draft); if (event.key === "Escape") onCancelRename(entity.id); }}
          onBlur={() => { if (draft.trim()) onRename(entity.id, draft); else onCancelRename(entity.id); }} /> : <strong>{entity.name}</strong>}
      </div>
      <div className="concept-meta">{KIND_LABELS[entity.kind]}</div>
      {entity.technology && <div className="concept-technology">{entity.technology}</div>}
      <Handle id="out-right" type="source" position={Position.Right} className="concept-handle" />
      <Handle id="out-bottom" type="source" position={Position.Bottom} className="concept-handle" />
    </div>
    <NodeToolbar isVisible={selected && !editing} position={Position.Bottom} offset={18} className="node-understanding nodrag nowheel" onMouseDown={(event) => event.stopPropagation()}>
      <h2>{entity.name}</h2><div className="understanding-meta">{KIND_LABELS[entity.kind]}{entity.technology ? ` · ${entity.technology}` : ""}</div>
      {entity.purpose ? <p>{entity.purpose}</p> : <p className="empty-purpose">No purpose recorded <button onClick={() => onAction(entity.id, "details")}>Add</button></p>}
      {connections.length > 0 && <section><h3>Connections</h3>{connections.map((connection, index) => <div className="connection-line" key={`${connection.name}-${index}`}>
        <span>{connection.direction === "out" ? "→" : "←"} {connection.name}</span><small>{connection.kind}</small></div>)}</section>}
      {entity.decisions.length > 0 && <section><h3>Decisions</h3>{entity.decisions.map((decision) => <div className="decision-line" key={decision.id}>{decision.title}<small>{decision.status}</small></div>)}</section>}
      <div className="understanding-summary"><button onClick={() => onAction(entity.id, "considerations")}>{outstanding ? `${outstanding} things to consider` : "Considerations reviewed"}</button><span>{openDecisions} open decision{openDecisions === 1 ? "" : "s"}</span></div>
      <footer><button onClick={() => onAction(entity.id, "decision")}>+ Decision</button><button onClick={() => onAction(entity.id, "details")}>Edit details</button><button onClick={() => onAction(entity.id, "duplicate")}>Duplicate</button></footer>
    </NodeToolbar>
  </>;
}

export function RelationshipEdge({ id, data, selected, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }: EdgeProps<StudioEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return <BaseEdge id={id} path={path} markerEnd={markerEnd} />;
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: selected ? "#57688d" : "#9aa4b3", strokeWidth: selected ? 1.8 : 1.4 }} interactionWidth={24} />
    {data.relationship.kind !== "generic" && <EdgeLabelRenderer><span className="edge-kind-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{RELATIONSHIP_LABELS[data.relationship.kind]}</span></EdgeLabelRenderer>}
    <EdgeToolbar edgeId={id} x={labelX} y={labelY} isVisible={selected} className="edge-understanding nodrag nowheel" onMouseDown={(event) => event.stopPropagation()}>
      <strong>{data.sourceName} → {data.targetName}</strong><span>{RELATIONSHIP_LABELS[data.relationship.kind]}</span>
      {data.relationship.notes && <p>{data.relationship.notes}</p>}
      <footer><button onClick={() => data.onAction(id, "edit")}>Edit</button><button onClick={() => data.onAction(id, "delete")}>Delete</button></footer>
    </EdgeToolbar>
  </>;
}

export const NODE_TYPES = { concept: ConceptNode };
export const EDGE_TYPES = { relationship: RelationshipEdge };
