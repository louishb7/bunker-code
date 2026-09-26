import { useState } from "react";
import { CONSIDERATIONS, RELATIONSHIP_KINDS, SEMANTIC_KINDS, type ConsiderationStatus, type DecisionStatus, type DesignDocument, type DesignEntity, type DesignRelationship, type SystemContext } from "@bunker-code/design-model";
import { CONCEPT_LANGUAGE, CONSIDERATION_STATUS_LABELS, CREATION_ORDER, DECISION_STATUS_LABELS, RELATIONSHIP_LANGUAGE } from "./studio-language";

export type StudioPanel =
  | { type: "context" }
  | { type: "glossary" }
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
  { title: "Geral", fields: [["systemName", "Nome do sistema"], ["purpose", "Propósito"]] },
  { title: "Escala", fields: [["registeredUsers", "Usuários cadastrados"], ["dailyActiveUsers", "Usuários ativos por dia"], ["peakConcurrentUsers", "Usuários simultâneos no pico"], ["peakRequestsPerSecond", "Requisições por segundo no pico"]] },
  { title: "Qualidade", fields: [["availabilityTarget", "Meta de disponibilidade"], ["latencyTarget", "Meta de latência"]] },
  { title: "Restrições", fields: [["dataSensitivity", "Sensibilidade dos dados"], ["budgetConstraint", "Limite de orçamento"], ["deploymentConstraint", "Restrição de deploy"]] },
];

export function StudioPanelView(props: Props) {
  const { panel, design, onClose, onPanel } = props;
  const entity = "entityId" in panel ? design.entities.find((item) => item.id === panel.entityId) : undefined;
  const relationship = panel.type === "relationship" ? design.relationships.find((item) => item.id === panel.relationshipId) : undefined;
  const title = panel.type === "context" ? "Contexto do sistema" : panel.type === "glossary" ? "Conceitos" : panel.type === "details" ? "Editar detalhes" : panel.type === "considerations" ? "Pontos para considerar" : panel.type === "decision" ? "Adicionar decisão" : "Relação";
  return <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="detail-panel" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><small>BunkerCode DESIGN</small><h2>{title}</h2></div><button className="close-button" aria-label="Fechar painel" onClick={onClose}>×</button></header>
      {panel.type === "context" && <ContextContent context={design.systemContext} onSave={props.onContext} />}
      {panel.type === "glossary" && <div className="glossary"><p className="muted">Referência rápida para as partes do seu sistema.</p>{CREATION_ORDER.map((kind) => <section key={kind}>
        <h3>{CONCEPT_LANGUAGE[kind].technical}</h3><p>{CONCEPT_LANGUAGE[kind].explanation}</p>
      </section>)}</div>}
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
    <h3>{context.systemName || "Sistema sem nome"}</h3>
    {context.purpose ? <p>{context.purpose}</p> : <p className="muted">Nenhum propósito registrado</p>}
    <section><h4>Escala</h4><div className="summary-grid">
      <SummaryMetric value={context.registeredUsers} label="usuários cadastrados" /><SummaryMetric value={context.dailyActiveUsers} label="ativos por dia" />
      <SummaryMetric value={context.peakConcurrentUsers} label="simultâneos no pico" /><SummaryMetric value={context.peakRequestsPerSecond} label="requisições/s no pico" />
    </div></section>
    <section><h4>Qualidade</h4><div className="quality-row"><span>Disponibilidade</span><strong>{context.availabilityTarget || "Não definida"}</strong></div><div className="quality-row"><span>Latência</span><strong>{context.latencyTarget || "Não definida"}</strong></div></section>
    <section><h4>Restrições</h4>{[context.dataSensitivity, context.budgetConstraint, context.deploymentConstraint].filter(Boolean).length ?
      [context.dataSensitivity, context.budgetConstraint, context.deploymentConstraint].filter(Boolean).map((value) => <p key={value}>{value}</p>) : <p className="muted">Nenhuma registrada</p>}</section>
    <section><h4>Premissas</h4><p>{context.assumptions.length} registrada{context.assumptions.length === 1 ? "" : "s"}</p>{context.assumptions.map((item, index) => <p key={index}>{item}</p>)}</section>
    <button className="primary-action" onClick={() => setEditing(true)}>Editar contexto</button>
  </div>;
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...draft, assumptions: assumptionsText.split("\n").map((item) => item.trim()).filter(Boolean) }); setEditing(false); }}>
    {contextGroups.map((group) => <section key={group.title}><h3>{group.title}</h3>{group.fields.map(([field, label]) => <label key={field}>{label}
      {field === "purpose" ? <textarea value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /> :
        <input value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />}</label>)}</section>)}
    <section><h3>Premissas</h3><label>Uma por linha<textarea value={assumptionsText} onChange={(event) => setAssumptionsText(event.target.value)} /></label></section>
    <div className="form-actions"><button type="submit" className="primary-action">Salvar contexto</button><button type="button" onClick={() => setEditing(false)}>Cancelar</button></div>
  </form>;
}
function SummaryMetric({ value, label }: { value: string; label: string }) { return <div><strong>{value || "—"}</strong><span>{label}</span></div>; }

function DetailsContent({ entity, onSave, onClose }: { entity: DesignEntity; onSave: (entity: DesignEntity) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(entity);
  const [showNotes, setShowNotes] = useState(!!entity.notes);
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) { onSave({ ...draft, name: draft.name.trim() }); onClose(); } }}>
    <label>Nome<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
    <label>O que esta parte faz?<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as DesignEntity["kind"], considerationStates: {} })}>
      {SEMANTIC_KINDS.map((kind) => <option key={kind} value={kind}>{CONCEPT_LANGUAGE[kind].action} · {CONCEPT_LANGUAGE[kind].technical}</option>)}</select></label>
    <label>Tecnologia <span className="optional">opcional</span><input value={draft.technology} onChange={(event) => setDraft({ ...draft, technology: event.target.value })} /></label>
    <label>Propósito<textarea value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} /></label>
    {showNotes ? <label>Notas<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label> : <button type="button" className="text-button" onClick={() => setShowNotes(true)}>+ Adicionar notas</button>}
    <div className="form-actions"><button type="submit" className="primary-action">Salvar detalhes</button><button type="button" onClick={onClose}>Cancelar</button></div>
  </form>;
}

function ConsiderationsContent({ entity, itemId, onStatus, onItem, onBack, onDecision }: {
  entity: DesignEntity; itemId?: string; onStatus: (entityId: string, itemId: string, status: ConsiderationStatus) => void;
  onItem: (id: string) => void; onBack: () => void; onDecision: () => void;
}) {
  const items = CONSIDERATIONS[entity.kind];
  const item = items.find((candidate) => candidate.id === itemId);
  if (item) return <div className="consideration-detail">
    <button className="text-button" onClick={onBack}>← Todos os pontos</button><h3>{item.title}</h3><p>{item.question}</p>
    <h4>Por que isso importa</h4><p>{item.whyItMatters}</p>
    <div className="form-actions"><button onClick={() => onStatus(entity.id, item.id, "considered")}>Marcar como considerado</button><button onClick={() => onStatus(entity.id, item.id, "not-relevant")}>Não se aplica</button></div>
    <button className="text-button" onClick={onDecision}>+ Registrar decisão</button>
    <p className="muted">Estado: {CONSIDERATION_STATUS_LABELS[entity.considerationStates[item.id] ?? "unreviewed"]}</p>
  </div>;
  return <div className="consideration-list"><p className="muted">Perguntas para ajudar a pensar. Você não precisa responder.</p>{items.map((candidate) => <button key={candidate.id} onClick={() => onItem(candidate.id)}>
    <strong>{candidate.title}</strong><span>{CONSIDERATION_STATUS_LABELS[entity.considerationStates[candidate.id] ?? "unreviewed"]}</span>
  </button>)}</div>;
}
function DecisionContent({ entity, onSave, onClose }: { entity: DesignEntity; onSave: (entityId: string, title: string, reason: string, status: DecisionStatus) => void; onClose: () => void }) {
  const [title, setTitle] = useState(""); const [reason, setReason] = useState(""); const [status, setStatus] = useState<DecisionStatus>("open");
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); if (title.trim()) { onSave(entity.id, title, reason, status); onClose(); } }}>
    <p className="muted">Para {entity.name}</p><label>Título<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
    <label>Motivo<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as DecisionStatus)}><option value="open">{DECISION_STATUS_LABELS.open}</option><option value="accepted">{DECISION_STATUS_LABELS.accepted}</option><option value="rejected">{DECISION_STATUS_LABELS.rejected}</option></select></label>
    <div className="form-actions"><button type="submit" className="primary-action">Adicionar decisão</button><button type="button" onClick={onClose}>Cancelar</button></div>
  </form>;
}
function RelationshipContent({ relationship, onSave, onClose }: { relationship: DesignRelationship; onSave: (relationship: DesignRelationship) => void; onClose: () => void }) {
  const [kind, setKind] = useState(relationship.kind); const [notes, setNotes] = useState(relationship.notes);
  return <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...relationship, kind, notes }); onClose(); }}>
    <label>O que esta relação significa?<select value={kind} onChange={(event) => setKind(event.target.value as DesignRelationship["kind"])}>
      {RELATIONSHIP_KINDS.map((item) => <option key={item} value={item}>{RELATIONSHIP_LANGUAGE[item].label}</option>)}</select></label>
    <p className="muted">{RELATIONSHIP_LANGUAGE[kind].explanation}</p>
    <label>Notas <span className="optional">opcional</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    <div className="form-actions"><button type="submit" className="primary-action">Salvar relação</button><button type="button" onClick={onClose}>Cancelar</button></div>
  </form>;
}
