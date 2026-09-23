import { ImplementationPanel, type CommitImplementation } from './designer-implementation-panel.js';
import type { DesignImplementation } from './designer-implementation.js';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { PlannedClaim, PlannedOpenQuestion, PlannedPredicateDefinition, PlannedRelation, PlannedSubjectRef, PlannedSystemModel } from '@bunker-code/contracts';
import { removePlannedClaim, removePlannedOpenQuestion, removePlannedPredicate,
  savePlannedClaim, savePlannedOpenQuestion, savePlannedPart, savePlannedPredicate, savePlannedRelation, updatePlannedContext,
} from '@bunker-code/planned-system';

export type DesignerEditor = { kind: 'inspect' } | { kind: 'new-part' } | { kind: 'new-relation'; source?: string; target?: string };
export type CommitModel = (operation: (model: PlannedSystemModel) => PlannedSystemModel) => boolean;
interface InspectorProps {
  model: PlannedSystemModel; selection: PlannedSubjectRef; editor: DesignerEditor; showNotes: boolean; implementation: DesignImplementation; commitImplementation: CommitImplementation;
  commit: CommitModel; select(subject: PlannedSubjectRef): void; closeEditor(): void;
  connect(source?: string, target?: string): void; navigate(action: () => void): void; remove(): void;
}
function text(data: FormData, name: string): string { return String(data.get(name) ?? '').trim(); }
function optional(data: FormData, name: string): Record<string, string> {
  const value = text(data, name); return value ? { [name]: value } : {};
}
export function Field({ name, label, value, required = false, multiline = false, autoFocus = false }: { name: string; label: string; value?: string; required?: boolean; multiline?: boolean; autoFocus?: boolean }) {
  return <label className="designer-field">{label}{multiline
    ? <textarea name={name} defaultValue={value ?? ''} required={required} autoFocus={autoFocus} rows={3} />
    : <input name={name} defaultValue={value ?? ''} required={required} autoFocus={autoFocus} autoComplete="off" />}</label>;
}
function Form({ children, submit, label = 'Save changes' }: { children: ReactNode; submit(data: FormData): void; label?: string }) {
  return <form className="designer-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }}>
    {children}<button className="designer-primary" type="submit">{label}</button>
  </form>;
}
function AuthorFields({ value }: { value?: { rationale?: string; reference?: string } }) {
  return <details className="designer-author-fields"><summary>Rationale & reference</summary>
    <Field name="rationale" label="Rationale" value={value?.rationale} multiline />
    <Field name="reference" label="Reference" value={value?.reference} />
  </details>;
}
export function relationLabel(model: PlannedSystemModel, relation: PlannedRelation): string {
  return `${model.parts.find((item) => item.id === relation.sourcePartId)?.label ?? '?'} → ${model.predicates.find((item) => item.id === relation.predicateId)?.label ?? '?'} → ${model.parts.find((item) => item.id === relation.targetPartId)?.label ?? '?'}`;
}
export function sameSubject(a: PlannedSubjectRef, b: PlannedSubjectRef): boolean {
  return a.kind === b.kind && (a.kind === 'model' || (a.kind === 'part' && b.kind === 'part' ? a.partId === b.partId : a.kind === 'relation' && b.kind === 'relation' && a.relationId === b.relationId));
}

export function DesignerInspector({ model, selection, editor, commit, select, closeEditor, connect, navigate, remove, showNotes, implementation, commitImplementation }: InspectorProps) {
  const [tab, setTab] = useState<'details' | 'notes' | 'predicates' | 'implementation'>(showNotes ? 'notes' : 'details');
  const [expandedPredicate, setExpandedPredicate] = useState<string | null>(null);
  const notes = [...model.claims, ...model.openQuestions].filter((item) => sameSubject(item.subject, selection)).length;
  const part = selection.kind === 'part' ? model.parts.find((item) => item.id === selection.partId) : undefined;
  const relation = selection.kind === 'relation' ? model.relations.find((item) => item.id === selection.relationId) : undefined;
  if (editor.kind === 'new-part') return <aside className="designer-inspector" aria-label="Designer inspector">
    <div className="designer-section-heading"><h2>New Part</h2><button onClick={closeEditor}>Cancel</button></div>
    <p className="designer-muted">A concept in your system. Give it a name that helps you reason.</p>
    <Form label="Add Part" submit={(data) => {
      const id = crypto.randomUUID();
      if (commit((current) => savePlannedPart(current, { id, label: text(data, 'label'), ...optional(data, 'description') }))) select({ kind: 'part', partId: id });
    }}><Field name="label" label="Part name" required autoFocus /><Field name="description" label="Description" multiline /></Form>
  </aside>;
  if (editor.kind === 'new-relation') return <aside className="designer-inspector" aria-label="Designer inspector">
    <div className="designer-section-heading"><h2>New Relation</h2><button onClick={closeEditor}>Cancel</button></div>
    <RelationForm model={model} source={editor.source} target={editor.target} commit={commit} saved={(id) => select({ kind: 'relation', relationId: id })} />
  </aside>;
  return <aside className="designer-inspector" aria-label="Designer inspector" data-inspector-subject={selection.kind}>
    <div className="designer-section-heading"><span className="eyebrow">{selection.kind === 'model' ? 'System context' : `Selected ${selection.kind}`}</span>
      {selection.kind !== 'model' && <button onClick={() => select({ kind: 'model' })}>System</button>}</div>
    <div className="designer-inspector-tabs" role="group" aria-label="Inspector sections">
      <button aria-pressed={tab === 'details'} onClick={() => { if (tab !== 'details') navigate(() => setTab('details')); }}>Details</button>
      <button aria-pressed={tab === 'notes'} onClick={() => { if (tab !== 'notes') navigate(() => setTab('notes')); }}>Notes <span>{notes}</span></button>
      {selection.kind === 'model' && <button aria-pressed={tab === 'predicates'} onClick={() => { if (tab !== 'predicates') navigate(() => setTab('predicates')); }}>Predicates</button>}
      {(part || selection.kind === 'model') && <button aria-pressed={tab === 'implementation'} onClick={() => { if (tab !== 'implementation') navigate(() => setTab('implementation')); }}>Implementation</button>}
    </div>
    {tab === 'implementation' ? <ImplementationPanel model={model} implementation={implementation} partId={part?.id} commit={commitImplementation} select={select} /> : tab === 'predicates' ? <><h2>Predicates</h2><p className="designer-muted">Your definitions for connections. Create one while connecting Parts.</p>
      {model.predicates.length === 0 && <p className="designer-muted">No predicates yet.</p>}
      {model.predicates.map((predicate) => <PredicateEditor key={predicate.id} predicate={predicate} model={model} commit={commit} expanded={expandedPredicate === predicate.id} toggle={() => navigate(() => setExpandedPredicate(expandedPredicate === predicate.id ? null : predicate.id))} />)}
    </> : tab === 'notes' ? <><h2>{part?.label ?? (relation ? 'Relation notes' : 'System notes')}</h2><p className="designer-muted">Claims and open questions attached to this {selection.kind === 'model' ? 'system' : selection.kind}.</p><Annotations model={model} subject={selection} commit={commit} navigate={navigate} /></> : <>
    {part ? <>
      <h2>{part.label}</h2>
      <Form submit={(data) => { commit((current) => savePlannedPart(current, { id: part.id, label: text(data, 'label'), ...optional(data, 'description') })); }}>
        <Field name="label" label="Part name" value={part.label} required /><Field name="description" label="Description" value={part.description} multiline />
      </Form>
      <section className="designer-connections"><div className="designer-section-heading"><h3>Connections</h3><button onClick={() => connect(part.id)}>Connect Part</button></div>
        {!model.relations.some((item) => item.sourcePartId === part.id || item.targetPartId === part.id) && <p className="designer-muted">No connections yet. Connect this Part to give it context.</p>}
        {model.relations.filter((item) => item.sourcePartId === part.id || item.targetPartId === part.id).map((item) => <button className="designer-relation-link" key={item.id} onClick={() => select({ kind: 'relation', relationId: item.id })}><span>{item.sourcePartId === part.id ? 'Outgoing ↗' : 'Incoming ↙'}</span>{relationLabel(model, item)}</button>)}
      </section>
    </> : relation ? <>
      <h2>Relation</h2><p className="designer-relation-sentence">{relationLabel(model, relation)}</p>
      <RelationForm model={model} relation={relation} commit={commit} saved={() => {}} />
    </> : <>
      <h2>{model.context.representedSystem}</h2>
      <Form submit={(data) => { commit((current) => updatePlannedContext(current, { nature: 'planned-intention', representedSystem: text(data, 'name'), ...optional(data, 'scope') })); }}>
        <Field name="name" label="System name" value={model.context.representedSystem} required />
        <Field name="scope" label="Scope" value={model.context.scope} multiline />
      </Form>
    </>}
    {(part || relation) && <div className="designer-inspector-bottom"><button className="designer-danger" onClick={remove}>Delete {part ? 'Part' : 'Relation'}</button><span>Delete / Backspace</span></div>}
    </>}
  </aside>;
}

const starters = [
  { label: 'depends on', description: 'The source requires the target to fulfill its purpose.' },
  { label: 'uses', description: 'The source uses a capability provided by the target.' },
  { label: 'accesses', description: 'The source accesses the target.' },
  { label: 'sends to', description: 'The source sends information to the target.' },
  { label: 'reads from', description: 'The source reads information from the target.' },
];
function RelationForm({ model, relation, source, target, commit, saved }: { model: PlannedSystemModel; relation?: PlannedRelation; source?: string; target?: string; commit: CommitModel; saved(id: string): void }) {
  const [predicateChoice, setPredicateChoice] = useState(relation ? `existing:${relation.predicateId}` : model.predicates[0] ? `existing:${model.predicates[0].id}` : 'starter:0');
  const [customLabel, setCustomLabel] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  return <Form label={relation ? 'Save Relation' : 'Add Relation'} submit={(data) => {
    let newPredicate: PlannedPredicateDefinition | undefined;
    let predicateId: string;
    if (predicateChoice.startsWith('existing:')) predicateId = predicateChoice.slice(9);
    else {
      const starter = predicateChoice.startsWith('starter:') ? starters[Number(predicateChoice.slice(8))] : undefined;
      newPredicate = { id: crypto.randomUUID(), label: starter?.label ?? customLabel.trim(), description: starter?.description ?? customDescription.trim() };
      predicateId = newPredicate.id;
    }
    const id = relation?.id ?? crypto.randomUUID();
    if (commit((current) => savePlannedRelation(current, { id, sourcePartId: text(data, 'source'), targetPartId: text(data, 'target'), predicateId,
      ...optional(data, 'description'), ...optional(data, 'rationale'), ...optional(data, 'reference') }, newPredicate))) {
      if (newPredicate) setPredicateChoice(`existing:${predicateId}`);
      saved(id);
    }
  }}>
    <label className="designer-field">Source Part<select name="source" defaultValue={relation?.sourcePartId ?? source ?? model.parts[0]?.id} required>{model.parts.map((part) => <option key={part.id} value={part.id}>{part.label}</option>)}</select></label>
    <label className="designer-field">Predicate<select name="predicate" value={predicateChoice} onChange={(event) => setPredicateChoice(event.target.value)}>
      {model.predicates.length > 0 && <optgroup label="Your predicates">{model.predicates.map((predicate) => <option key={predicate.id} value={`existing:${predicate.id}`}>{predicate.label}</option>)}</optgroup>}
      <optgroup label="Starters — editable definitions">{starters.map((starter, index) => model.predicates.some((predicate) => predicate.label === starter.label && predicate.description === starter.description) ? null : <option key={starter.label} value={`starter:${index}`}>{starter.label}</option>)}</optgroup>
      <option value="custom">Create custom predicate…</option>
    </select></label>
    {predicateChoice === 'custom' ? <>
      <label className="designer-field">Predicate label<input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} required /></label>
      <label className="designer-field">Predicate meaning<textarea value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} required placeholder="What does source → target mean?" /></label>
    </> : <p className="designer-muted">{predicateChoice.startsWith('existing:') ? model.predicates.find((item) => item.id === predicateChoice.slice(9))?.description : starters[Number(predicateChoice.slice(8))]?.description}</p>}
    <label className="designer-field">Target Part<select name="target" defaultValue={relation?.targetPartId ?? target ?? model.parts.find((part) => part.id !== (source ?? model.parts[0]?.id))?.id} required>{model.parts.map((part) => <option key={part.id} value={part.id}>{part.label}</option>)}</select></label>
    <Field name="description" label="Description" value={relation?.description} multiline /><AuthorFields value={relation} />
  </Form>;
}
function PredicateEditor({ predicate, model, commit, expanded, toggle }: { predicate: PlannedPredicateDefinition; model: PlannedSystemModel; commit: CommitModel; expanded: boolean; toggle(): void }) {
  const used = model.relations.filter((item) => item.predicateId === predicate.id).length;
  return <section className="designer-predicate"><button className="designer-predicate-toggle" aria-expanded={expanded} onClick={toggle}>{predicate.label}<span>{used} Relations {expanded ? '−' : '+'}</span></button>{expanded && <>
    <Form submit={(data) => { commit((current) => savePlannedPredicate(current, { id: predicate.id, label: text(data, 'label'), description: text(data, 'description') })); }}>
      <Field name="label" label="Predicate label" value={predicate.label} required /><Field name="description" label="Predicate meaning" value={predicate.description} required multiline />
    </Form>
    <button className="designer-danger" disabled={used > 0} title={used ? 'Reassign or remove its Relations first.' : undefined} onClick={() => { if (window.confirm(`Delete predicate “${predicate.label}”?`)) commit((current) => removePlannedPredicate(current, predicate.id)); }}>Delete predicate</button>
    {used > 0 && <p className="designer-muted">Reassign or remove its Relations before deleting.</p>}
  </>}</section>;
}
function Annotations({ model, subject, commit, navigate }: { model: PlannedSystemModel; subject: PlannedSubjectRef; commit: CommitModel; navigate(action: () => void): void }) {
  const [editing, setEditing] = useState<{ kind: 'claim' | 'question'; id?: string } | null>(null);
  const claims = model.claims.filter((item) => sameSubject(item.subject, subject));
  const questions = model.openQuestions.filter((item) => sameSubject(item.subject, subject));
  return <div className="designer-annotations">
    <section><div className="designer-section-heading"><h3>Claims <span>{claims.length}</span></h3><button onClick={() => { if (editing?.kind !== 'claim' || editing.id) navigate(() => setEditing({ kind: 'claim' })); }}>Add Claim</button></div>
      {claims.length === 0 && <p className="designer-muted">What must hold true for this {subject.kind === 'model' ? 'system' : subject.kind}?</p>}
      {claims.map((claim) => <article className="designer-note" key={claim.id}><span className={`designer-modality ${claim.modality}`}>{claim.modality}</span><p>{claim.statement}</p>
        {claim.rationale && <p className="designer-muted">{claim.rationale}</p>}{claim.reference && <p className="designer-muted">Reference: {claim.reference}</p>}
        <button aria-label={`Edit Claim: ${claim.statement}`} onClick={() => { if (editing?.kind !== 'claim' || editing.id !== claim.id) navigate(() => setEditing({ kind: 'claim', id: claim.id })); }}>Edit</button>{' '}
        <button disabled={editing !== null && (editing.kind !== 'claim' || editing.id !== claim.id)} title={editing ? 'Finish or cancel this note before deleting another.' : undefined} aria-label={`Delete Claim: ${claim.statement}`} onClick={() => { if (window.confirm('Delete this Claim?') && commit((current) => removePlannedClaim(current, claim.id)) && editing?.kind === 'claim' && editing.id === claim.id) setEditing(null); }}>Delete</button>
      </article>)}
    </section>
    <section><div className="designer-section-heading"><h3>Open Questions <span>{questions.length}</span></h3><button onClick={() => { if (editing?.kind !== 'question' || editing.id) navigate(() => setEditing({ kind: 'question' })); }}>Add Question</button></div>
      {questions.length === 0 && <p className="designer-muted">Keep unresolved decisions close to their subject.</p>}
      {questions.map((question) => <article className="designer-note" key={question.id}><p>{question.question}</p>
        {question.rationale && <p className="designer-muted">{question.rationale}</p>}{question.reference && <p className="designer-muted">Reference: {question.reference}</p>}
        <button aria-label={`Edit Question: ${question.question}`} onClick={() => { if (editing?.kind !== 'question' || editing.id !== question.id) navigate(() => setEditing({ kind: 'question', id: question.id })); }}>Edit</button>{' '}
        <button disabled={editing !== null && (editing.kind !== 'question' || editing.id !== question.id)} title={editing ? 'Finish or cancel this note before deleting another.' : undefined} aria-label={`Delete Question: ${question.question}`} onClick={() => { if (window.confirm('Delete this Open Question?') && commit((current) => removePlannedOpenQuestion(current, question.id)) && editing?.kind === 'question' && editing.id === question.id) setEditing(null); }}>Delete</button>
      </article>)}
    </section>
    {editing && <section className="designer-note-editor" key={`${editing.kind}:${editing.id ?? 'new'}`}>
      <div className="designer-section-heading"><h3>{editing.id ? 'Edit' : 'New'} {editing.kind === 'claim' ? 'Claim' : 'Open Question'}</h3><button onClick={() => navigate(() => setEditing(null))}>Cancel</button></div>
      <AnnotationForm model={model} subject={subject} kind={editing.kind} item={editing.kind === 'claim' ? model.claims.find((item) => item.id === editing.id) : model.openQuestions.find((item) => item.id === editing.id)} commit={commit} done={() => setEditing(null)} />
    </section>}
  </div>;
}
function AnnotationForm({ model, subject, kind, item, commit, done }: { model: PlannedSystemModel; subject: PlannedSubjectRef; kind: 'claim' | 'question'; item?: PlannedClaim | PlannedOpenQuestion; commit: CommitModel; done(): void }) {
  const subjects: { value: PlannedSubjectRef; label: string }[] = [
    { value: { kind: 'model' }, label: 'System' },
    ...model.parts.map((part) => ({ value: { kind: 'part' as const, partId: part.id }, label: `Part: ${part.label}` })),
    ...model.relations.map((relation) => ({ value: { kind: 'relation' as const, relationId: relation.id }, label: `Relation: ${relationLabel(model, relation)}` })),
  ];
  return <Form label={kind === 'claim' ? 'Save Claim' : 'Save Question'} submit={(data) => {
    const selectedSubject = subjects[Number(text(data, 'subject'))]?.value;
    if (!selectedSubject) return;
    const common = { id: item?.id ?? crypto.randomUUID(), subject: selectedSubject, ...optional(data, 'rationale'), ...optional(data, 'reference') };
    if (kind === 'claim') {
      const modality = text(data, 'modality');
      if (modality !== 'required' && modality !== 'prohibited' && modality !== 'assumed') return;
      if (commit((current) => savePlannedClaim(current, { ...common, modality, statement: text(data, 'statement') }))) done();
    } else if (commit((current) => savePlannedOpenQuestion(current, { ...common, question: text(data, 'question') }))) done();
  }}>
    <label className="designer-field">Subject<select name="subject" defaultValue={subjects.findIndex((entry) => sameSubject(entry.value, item?.subject ?? subject))}>{subjects.map((entry, index) => <option key={index} value={index}>{entry.label}</option>)}</select></label>
    {kind === 'claim' ? <>
      <label className="designer-field">Modality<select name="modality" defaultValue={item && 'modality' in item ? item.modality : 'required'}><option value="required">REQUIRED</option><option value="prohibited">PROHIBITED</option><option value="assumed">ASSUMED</option></select></label>
      <Field name="statement" label="Statement" value={item && 'statement' in item ? item.statement : ''} required multiline autoFocus />
    </> : <Field name="question" label="Question" value={item && 'question' in item ? item.question : ''} required multiline autoFocus />}
    <AuthorFields value={item} />
  </Form>;
}
