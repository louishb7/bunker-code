import { useState } from "react";
import { CONSIDERATIONS, RELATIONSHIP_KINDS, SEMANTIC_KINDS, type ConsiderationStatus, type DecisionStatus, type DesignDocument, type DesignEntity, type DesignRelationship, type SystemContext } from "@bunker-code/design-model";
import { KIND_LABELS, RELATIONSHIP_LABELS } from "./studio-projection";

export type StudioPanel =
  | { type: "context" }
  | { type: "details"; entityId: string }
  | { type: "considerations"; entityId: string; itemId?: string }
  | { type: "decision"; entityId: string }
  | { type: "relationship"; relationshipId: string };

type Props = {
  panel: StudioPanel;
  design: DesignDocument;
  onClose: () => void;
  onPanel: (panel: StudioPanel) => void;
  onContext: (context: SystemContext) => void;
  onEntity: (entity: DesignEntity) => void;
  onConsideration: (entityId: string, itemId: string, status: ConsiderationStatus) => void;
  onDecision: (entityId: string, title: string, reason: string, status: DecisionStatus) => void;
  onRelationship: (relationship: DesignRelationship) => void;
};

const contextGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<[keyof Omit<SystemContext, "assumptions">, string]> }> = [
  { title: "General", fields: [["systemName", "System name"], ["purpose", "Purpose"]] },
  { title: "Scale", fields: [["registeredUsers", "Registered users"], ["dailyActiveUsers", "Daily active users"], ["peakConcurrentUsers", "Peak concurrent users"], ["peakRequestsPerSecond", "Peak requests per second"]] },
  { title: "Quality", fields: [["availabilityTarget", "Availability target"], ["latencyTarget", "Latency target"]] },
  { title: "Constraints", fields: [["dataSensitivity", "Data sensitivity"], ["budgetConstraint", "Budget constraint"], ["deploymentConstraint", "Deployment constraint"]] },
];

export function StudioPanelView(props: Props) {
  const { panel, design, onClose, onPanel } = props;
  const entity = "entityId" in panel ? design.entities.find((item) => item.id === panel.entityId) : undefined;
  const relationship = panel.type === "relationship" ? design.relationships.find((item) => item.id === panel.relationshipId) : undefined;
  const title = panel.type === "context" ? "System Context" : panel.type === "details" ? "Edit details" : panel.type === "considerations" ? "Things to consider" : panel.type === "decision" ? "Add decision" : "Relationship";
  return <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="detail-panel" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><small>BunkerCode DESIGN</small><h2>{title}</h2></div><button className="close-button" aria-label="Close panel" onClick={onClose}>×</button></header>
      {panel.type === "context" && <ContextContent context={design.systemContext} onSave={props.onContext} />}
      {panel.type === "details" && entity && <DetailsContent key={entity.id} entity={entity} onSave={props.onEntity} onClose={onClose} />}
      {panel.type === "considerations" && entity && <ConsiderationsContent entity={entity} itemId={panel.itemId} onStatus={props.onConsideration}
        onItem={(itemId) => onPanel({ type: "considerations", entityId: entity.id, itemId })} onBack={() => onPanel({ type: "considerations", entityId: entity.id })}
        onDecision={() => onPanel({ type: "decision", entityId: entity.id })} />}
      {panel.type === "decision" && entity && <DecisionContent entity={entity} onSave={props.onDecision} onClose={onClose} />}
      {panel.type === "relationship" && relationship && <RelationshipContent key={relationship.id} relationship={relationship} onSave={props.onRelationship} onClose={onClose} />}
    </section>
  </div>;
}

function ContextContent({ context, onSave }: { context: SystemContext; onSave: (context: SystemContext) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(context);
  const [assumptionsText, setAssumptionsText] = useState(context.assumptions.join("\n"));
  if (!editing) return <div className="context-summary">
    <h3>{context.systemName || "Unnamed system"}</h3>
    {context.purpose ? <p>{context.purpose}</p> : <p className="muted">No purpose recorded</p>}
    <section><h4>Scale</h4><div className="summary-grid">
      <SummaryMetric value={context.registeredUsers} label="registered" /><SummaryMetric value={context.dailyActiveUsers} label="daily active" />
      <SummaryMetric value={context.peakConcurrentUsers} label="concurrent" /><SummaryMetric value={context.peakRequestsPerSecond} label="req/s" />
    </div></section>
    <section><h4>Quality</h4><p>Availability: {context.availabilityTarget || "not defined"}</p><p>Latency: {context.latencyTarget || "not defined"}</p></section>
    <section><h4>Constraints</h4>{[context.dataSensitivity, context.budgetConstraint, context.deploymentConstraint].filter(Boolean).length ?
      [context.dataSensitivity, context.budgetConstraint, context.deploymentConstraint].filter(Boolean).map((value) => <p key={value}>{value}</p>) : <p className="muted">None recorded</p>}</section>
    <section><h4>Assumptions</h4><p>{context.assumptions.length} recorded</p>{context.assumptions.map((item, index) => <p key={index}>{item}</p>)}</section>
    <button className="primary-action" onClick={() => setEditing(true)}>Edit context</button>
  </div>;
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...draft, assumptions: assumptionsText.split("\n").map((item) => item.trim()).filter(Boolean) }); setEditing(false); }}>
    {contextGroups.map((group) => <section key={group.title}><h3>{group.title}</h3>{group.fields.map(([field, label]) => <label key={field}>{label}
      {field === "purpose" ? <textarea value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /> :
        <input value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />}</label>)}</section>)}
    <section><h3>Assumptions</h3><label>One per line<textarea value={assumptionsText} onChange={(event) => setAssumptionsText(event.target.value)} /></label></section>
    <div className="form-actions"><button type="submit" className="primary-action">Save context</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div>
  </form>;
}
function SummaryMetric({ value, label }: { value: string; label: string }) { return <div><strong>{value || "—"}</strong><span>{label}</span></div>; }

function DetailsContent({ entity, onSave, onClose }: { entity: DesignEntity; onSave: (entity: DesignEntity) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(entity);
  const [showNotes, setShowNotes] = useState(!!entity.notes);
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) { onSave({ ...draft, name: draft.name.trim() }); onClose(); } }}>
    <label>Name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
    <label>Kind<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as DesignEntity["kind"], considerationStates: {} })}>
      {SEMANTIC_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}</select></label>
    <label>Technology <span className="optional">optional</span><input value={draft.technology} onChange={(event) => setDraft({ ...draft, technology: event.target.value })} /></label>
    <label>Purpose<textarea value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} /></label>
    {showNotes ? <label>Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label> : <button type="button" className="text-button" onClick={() => setShowNotes(true)}>+ Add notes</button>}
    <div className="form-actions"><button type="submit" className="primary-action">Save details</button><button type="button" onClick={onClose}>Cancel</button></div>
  </form>;
}

function ConsiderationsContent({ entity, itemId, onStatus, onItem, onBack, onDecision }: {
  entity: DesignEntity; itemId?: string; onStatus: (entityId: string, itemId: string, status: ConsiderationStatus) => void;
  onItem: (id: string) => void; onBack: () => void; onDecision: () => void;
}) {
  const items = CONSIDERATIONS[entity.kind];
  const item = items.find((candidate) => candidate.id === itemId);
  if (item) return <div className="consideration-detail">
    <button className="text-button" onClick={onBack}>← All considerations</button><h3>{item.title}</h3><p>{item.question}</p>
    <h4>Why this matters</h4><p>{item.whyItMatters}</p>
    <div className="form-actions"><button onClick={() => onStatus(entity.id, item.id, "considered")}>Mark considered</button><button onClick={() => onStatus(entity.id, item.id, "not-relevant")}>Not relevant</button></div>
    <button className="text-button" onClick={onDecision}>+ Add decision</button>
    <p className="muted">Current status: {(entity.considerationStates[item.id] ?? "unreviewed").replace("-", " ")}</p>
  </div>;
  return <div className="consideration-list"><p className="muted">Prompts for reflection. Nothing is required.</p>{items.map((candidate) => <button key={candidate.id} onClick={() => onItem(candidate.id)}>
    <strong>{candidate.title}</strong><span>{(entity.considerationStates[candidate.id] ?? "unreviewed") === "unreviewed" ? "Not considered" : (entity.considerationStates[candidate.id] ?? "unreviewed").replace("-", " ")}</span>
  </button>)}</div>;
}
function DecisionContent({ entity, onSave, onClose }: { entity: DesignEntity; onSave: (entityId: string, title: string, reason: string, status: DecisionStatus) => void; onClose: () => void }) {
  const [title, setTitle] = useState(""); const [reason, setReason] = useState(""); const [status, setStatus] = useState<DecisionStatus>("open");
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); if (title.trim()) { onSave(entity.id, title, reason, status); onClose(); } }}>
    <p className="muted">For {entity.name}</p><label>Title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
    <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as DecisionStatus)}><option value="open">Open</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></label>
    <div className="form-actions"><button type="submit" className="primary-action">Add decision</button><button type="button" onClick={onClose}>Cancel</button></div>
  </form>;
}
function RelationshipContent({ relationship, onSave, onClose }: { relationship: DesignRelationship; onSave: (relationship: DesignRelationship) => void; onClose: () => void }) {
  const [kind, setKind] = useState(relationship.kind); const [notes, setNotes] = useState(relationship.notes);
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...relationship, kind, notes }); onClose(); }}>
    <label>Meaning<select value={kind} onChange={(event) => setKind(event.target.value as DesignRelationship["kind"])}>
      {RELATIONSHIP_KINDS.map((item) => <option key={item} value={item}>{RELATIONSHIP_LABELS[item]}</option>)}</select></label>
    <label>Notes <span className="optional">optional</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    <div className="form-actions"><button type="submit" className="primary-action">Save relationship</button><button type="button" onClick={onClose}>Cancel</button></div>
  </form>;
}
