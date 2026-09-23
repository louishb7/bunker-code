import { useEffect, useRef, useState } from 'react';
import type { PlannedSubjectRef, PlannedSystemModel } from '@bunker-code/contracts';
import { createPlannedSystemModel, removePlannedPart, removePlannedRelation } from '@bunker-code/planned-system';
import { emptyImplementation, implementationAfterModelEdit, technologiesForPart, validateImplementation } from './designer-implementation.js';
import type { CommitImplementation } from './designer-implementation-panel.js';
import { exportDesignerSVG } from './designer-visual-export.js';
import { positionsForEdit } from './designer-layout.js';
import { DesignerCanvas } from './designer-canvas.js';
import { DesignerInspector, Field, relationLabel, type DesignerEditor } from './designer-inspector.js';
import { deleteDesignerDocument, designerStoragePrefix, exportPlannedSystemJSON, exportDesignDocumentJSON, importDesignerJSON,
  readDesignerLibrary, saveDesignerDocument, type DesignerDocument, type DesignerPresentation, type StoredDesignerDocument,
} from './designer-storage.js';

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function download(contents: string, filename: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type RegisterNavigationGuard = (guard: (() => boolean) | null) => void;

export function DesignApp({ registerNavigationGuard }: { registerNavigationGuard: RegisterNavigationGuard }) {
  const [library, setLibrary] = useState<ReturnType<typeof readDesignerLibrary>>({ documents: [], issues: [] });
  const [active, setActive] = useState<StoredDesignerDocument | null>(null);
  const [panel, setPanel] = useState<'create' | 'import' | null>(null);
  const [error, setError] = useState('');
  const [importText, setImportText] = useState('');
  const [conflict, setConflict] = useState<DesignerDocument | null>(null);
  function refresh() {
    try { setLibrary(readDesignerLibrary(window.localStorage)); setError(''); }
    catch (failure) { setError(`Local storage is unavailable: ${message(failure)}`); }
  }
  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  function openDocument(document: DesignerDocument): boolean {
    try {
      const saved = saveDesignerDocument(window.localStorage, document, null);
      setActive(saved); setPanel(null); setError(''); setConflict(null); setImportText(''); return true;
    } catch (failure) { setError(message(failure)); return false; }
  }
  function importModel(raw: string) {
    try {
      const document = importDesignerJSON(raw);
      const model = document.model;
      if (window.localStorage.getItem(designerStoragePrefix + model.id) !== null) {
        setConflict(document); setError('A local system already has this identity. You can import a separate copy with a new system identity. The existing system will be preserved.');
      } else openDocument(document);
    } catch (failure) { setConflict(null); setError(message(failure)); }
  }
  if (active) return <Designer key={active.document.model.id} initial={active} registerNavigationGuard={registerNavigationGuard} back={() => { setActive(null); refresh(); }} />;
  return <main className="design-library" data-design-library>
    <header className="design-library-header"><div><p className="eyebrow">DESIGN / Your local systems</p><h1>Your systems, taking shape.</h1><p>A workspace for Parts, connections and the questions still open.</p></div>
      <div className="designer-actions"><button className="designer-primary" onClick={() => { setPanel('create'); setError(''); }}>New System</button><button onClick={() => { setPanel('import'); setError(''); }}>Import JSON</button></div>
    </header>
    {error && <div className="designer-error" role="alert">{error}</div>}
    {panel === 'create' && <section className="designer-library-panel"><div className="designer-section-heading"><h2>Create System</h2><button onClick={() => setPanel(null)}>Cancel</button></div>
      <form className="designer-form" onSubmit={(event) => {
        event.preventDefault();
        try { openDocument({ storageVersion: 2, model: createPlannedSystemModel({ representedSystem: String(new FormData(event.currentTarget).get('name') ?? '').trim() }), implementation: emptyImplementation(), presentation: { positions: {} }, updatedAt: new Date().toISOString() }); }
        catch (failure) { setError(message(failure)); }
      }}><Field name="name" label="System name" required autoFocus /><button className="designer-primary" type="submit">Create System</button></form>
    </section>}
    {panel === 'import' && <section className="designer-library-panel"><div className="designer-section-heading"><h2>Import Model or Design Document</h2><button onClick={() => { setPanel(null); setConflict(null); }}>Cancel</button></div>
      <p className="designer-muted">A Model contains structure only. A Design Document also includes technologies and layout.</p>
      <label className="designer-field">Choose JSON file<input type="file" accept=".json,application/json" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void file.text().then((raw) => { setImportText(raw); importModel(raw); }).catch((failure: unknown) => setError(message(failure)));
      }} /></label>
      <form className="designer-form" onSubmit={(event) => { event.preventDefault(); importModel(importText); }}>
        <label className="designer-field">Or paste JSON<textarea aria-label="Planned System JSON" rows={7} value={importText} onChange={(event) => { setImportText(event.target.value); setConflict(null); }} required /></label>
        <button type="submit">Import system</button>
      </form>
      {conflict && <button className="designer-primary" onClick={() => openDocument({ ...conflict, model: { ...conflict.model, id: crypto.randomUUID() } })}>Import as new system</button>}
    </section>}
    {!library.documents.length && !panel && <section className="design-empty"><div className="design-empty-mark" aria-hidden="true">□ → □</div><h2>A place to think before you build.</h2><p>Your planned systems live here, on this browser.<br />No repository or analysis is needed.</p><button className="designer-primary" onClick={() => setPanel('create')}>Create System</button></section>}
    <div className="design-system-list">{library.documents.map(({ document, raw }) => <article className="design-system-card" key={document.model.id}>
      <span className="eyebrow">Planned system</span><h2>{document.model.context.representedSystem}</h2><p>{document.model.context.scope ?? 'Scope not yet defined'}</p>
      <div className="design-card-counts"><span>{document.model.parts.length} Parts</span><span>{document.model.relations.length} Relations</span><span>{document.model.openQuestions.length} Questions</span></div>
      <small>Updated {new Date(document.updatedAt).toLocaleString()}</small>
      <div className="designer-actions"><button onClick={() => {
        try {
          const current = readDesignerLibrary(window.localStorage).documents.find((entry) => entry.document.model.id === document.model.id);
          if (!current) throw new Error('This system is unavailable. Refresh the library to inspect it.');
          setActive(current);
        } catch (failure) { setError(message(failure)); }
      }}>Open</button><button className="designer-danger" onClick={() => {
        if (window.confirm(`Delete “${document.model.context.representedSystem}” from this browser? Export it first if you need a backup.`)) {
          try { deleteDesignerDocument(window.localStorage, designerStoragePrefix + document.model.id, raw); refresh(); }
          catch (failure) { setError(message(failure)); }
        }
      }}>Delete</button></div>
    </article>)}</div>
    {library.issues.length > 0 && <section className="designer-storage-issues"><h2>Local documents needing attention</h2><p>These documents failed validation and have not been changed. Download the original JSON before removing a damaged document.</p>
      {library.issues.map((issue) => <article key={issue.key}><p>{issue.key}</p><pre>{issue.message}</pre><button onClick={() => download(issue.raw ?? '', 'unreadable-design-document.json')}>Download original</button>{' '}<button onClick={() => {
        if (window.confirm('Permanently remove this unreadable local document?')) {
          try { deleteDesignerDocument(window.localStorage, issue.key, issue.raw); refresh(); } catch (failure) { setError(message(failure)); }
        }
      }}>Delete unreadable document</button></article>)}
    </section>}
    <footer className="design-library-footer">Saved in this browser · Export a Design Document to back up structure, technologies and layout.</footer>
  </main>;
}

function Designer({ initial, back, registerNavigationGuard }: { initial: StoredDesignerDocument; back(): void; registerNavigationGuard: RegisterNavigationGuard }) {
  const [stored, setStored] = useState(initial);
  const current = useRef(stored);
  const [selection, setSelection] = useState<PlannedSubjectRef>({ kind: 'model' });
  const [showNotes, setShowNotes] = useState(false);
  const [editor, setEditor] = useState<DesignerEditor>({ kind: 'inspect' });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  function setDirty(value: boolean) { dirtyRef.current = value; setDirtyState(value); }
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<{ past: DesignerDocument[]; future: DesignerDocument[] }>({ past: [], future: [] });
  const [focusRequest, setFocusRequest] = useState<{ id: string; revision: number } | null>(null);
  function navigate(action: () => void, resetInspector = true) {
    if (dirtyRef.current) {
      if (!window.confirm('Discard unsaved form changes? Your last saved version will be kept.')) return;
      if (resetInspector) setRevision((value) => value + 1);
    }
    setDirty(false); action();
  }
  function remember(document: DesignerDocument) {
    setHistory((previous) => ({ past: [...previous.past.slice(-99), document], future: [] }));
  }
  function travel(direction: 'past' | 'future') {
    const destination = history[direction].at(-1);
    if (!destination) return;
    navigate(() => {
      const before = current.current.document;
      if (!persist(destination.model, { ...destination.presentation, viewport: before.presentation.viewport, lens: before.presentation.lens }, true, destination.implementation)) return;
      setHistory((previous) => direction === 'past'
        ? { past: previous.past.slice(0, -1), future: [...previous.future, before] }
        : { past: [...previous.past, before], future: previous.future.slice(0, -1) });
      setSelection({ kind: 'model' }); setEditor({ kind: 'inspect' }); setRevision((value) => value + 1);
    });
  }
  function removeSelection() {
    const part = selection.kind === 'part' ? model.parts.find((item) => item.id === selection.partId) : undefined;
    const relation = selection.kind === 'relation' ? model.relations.find((item) => item.id === selection.relationId) : undefined;
    if (!part && !relation) return;
    const connected = part ? model.relations.filter((item) => item.sourcePartId === part.id || item.targetPartId === part.id).length : 0;
    const prompt = part ? `Delete “${part.label}”? Its ${connected} connected Relations and their attached Claims and Open Questions will also be deleted, along with this Part’s notes and technology assignments.` : 'Delete this Relation and its Claims and Open Questions?';
    if (window.confirm(`${prompt}${dirtyRef.current ? ' Unsaved form changes will be discarded.' : ''} You can undo this while the system stays open.`)) {
      const removed = part ? commit((current) => removePlannedPart(current, part.id)) : relation ? commit((current) => removePlannedRelation(current, relation.id)) : false;
      if (removed) { setSelection({ kind: 'model' }); setEditor({ kind: 'inspect' }); }
    }
  }
  function resetContext() {
    navigate(() => { setSearch(''); setEditor({ kind: 'inspect' }); setShowNotes(false); setSelection({ kind: 'model' }); setRevision((value) => value + 1); });
  }
  useEffect(() => {
    registerNavigationGuard(() => !dirtyRef.current || window.confirm('Discard unsaved form changes before leaving DESIGN?'));
    return () => registerNavigationGuard(null);
  }, [registerNavigationGuard]);
  useEffect(() => {
    function leave(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); resetContext(); return; }
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey ? 'future' : 'past'); }
      else if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); travel('future'); }
      else if (!command && !event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); navigate(() => setEditor({ kind: 'new-part' })); }
      else if (!command && !event.altKey && event.key.toLowerCase() === 'r' && model.parts.length) { event.preventDefault(); connect(selection.kind === 'part' ? selection.partId : undefined); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelection(); }
      else if (event.key === '/') { event.preventDefault(); document.querySelector<HTMLInputElement>('[aria-label="Find Part"]')?.focus(); }
    }
    window.addEventListener('beforeunload', leave);
    window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('beforeunload', leave); window.removeEventListener('keydown', keyboard); };
  });
  const model = stored.document.model;
  function persist(nextModel: PlannedSystemModel, presentation: DesignerPresentation, authored: boolean, implementation = current.current.document.implementation): boolean {
    try {
      const next = saveDesignerDocument(window.localStorage, {
        storageVersion: 2, model: nextModel, presentation, implementation,
        updatedAt: authored ? new Date().toISOString() : current.current.document.updatedAt,
      }, current.current.raw);
      // Camera changes must not invalidate a pending semantic layout or reset author drafts.
      if (!authored) {
        next.document.model = current.current.document.model;
        next.document.implementation = current.current.document.implementation;
      }
      if (JSON.stringify(next.document.presentation.positions) === JSON.stringify(current.current.document.presentation.positions)) next.document.presentation.positions = current.current.document.presentation.positions;
      current.current = next; setStored(next); if (authored) { setError(''); setDirty(false); } return true;
    } catch (failure) { setError(`Not saved: ${message(failure)}`); return false; }
  }
  function commit(operation: (model: PlannedSystemModel) => PlannedSystemModel): boolean {
    try {
      const next = operation(current.current.document.model);
      const presentation = current.current.document.presentation;
      const positions = positionsForEdit(current.current.document.model, next, presentation);
      if (JSON.stringify(next) === JSON.stringify(current.current.document.model)) { setDirty(false); setError(''); return true; }
      const before = current.current.document;
      if (!persist(next, { ...presentation, positions }, true, implementationAfterModelEdit(current.current.document.implementation, current.current.document.model, next))) return false;
      remember(before); return true;
    } catch (failure) { setError(message(failure)); return false; }
  }
  const commitImplementation: CommitImplementation = (operation) => {
    try {
      const before = current.current.document;
      const next = validateImplementation(operation(before.implementation, before.model), before.model);
      if (JSON.stringify(next) === JSON.stringify(before.implementation)) return true;
      if (!persist(before.model, before.presentation, true, next)) return false;
      remember(before); return true;
    } catch (failure) { setError(message(failure)); return false; }
  };
  const implementation = stored.document.implementation;
  const matches = model.parts.filter((part) => part.label.toLowerCase().includes(search.toLowerCase()) || technologiesForPart(implementation, part.id).some((item) => item.label.toLowerCase().includes(search.toLowerCase())));
  function select(subject: PlannedSubjectRef) {
    if (JSON.stringify(subject) === JSON.stringify(selection) && editor.kind === 'inspect') return;
    navigate(() => { setShowNotes(false); setSelection(subject); setEditor({ kind: 'inspect' }); });
  }
  function inspectNotes(subject: PlannedSubjectRef) { navigate(() => { setSelection(subject); setEditor({ kind: 'inspect' }); setShowNotes(true); setRevision((value) => value + 1); }); }
  function connect(source?: string, target?: string) { navigate(() => setEditor({ kind: 'new-relation', source, target })); }
  function presentationChanged(presentation: DesignerPresentation): boolean {
    if (JSON.stringify(presentation) === JSON.stringify(current.current.document.presentation)) return true;
    const before = current.current.document;
    if (!persist(before.model, presentation, false)) return false;
    if (JSON.stringify(before.presentation.positions) !== JSON.stringify(presentation.positions)) remember(before);
    return true;
  }
  return <main className="designer" data-designer onChangeCapture={(event) => {
    if (event.target instanceof Element && event.target.closest('.designer-inspector form')) setDirty(true);
  }} onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target instanceof Element) { event.preventDefault(); event.target.closest('form')?.requestSubmit(); }
  }}>
    <header className="designer-header"><div className="designer-actions"><button onClick={() => navigate(back)}>← Systems</button><div><p className="eyebrow">Planned system</p><h1>{model.context.representedSystem}</h1></div></div>
      <div className="designer-actions"><span role="status" className={error || dirty ? 'designer-unsaved' : 'designer-saved'}>{error ? 'Needs attention' : dirty ? 'Unsaved form changes' : 'Saved locally'}</span><details className="designer-export" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
      }}><summary>Export</summary><div>
        <button onClick={() => download(exportPlannedSystemJSON(model), 'planned-system.json')}>Export Model JSON<small>Structure only · no technologies or layout</small></button>
        <button onClick={() => download(exportDesignDocumentJSON(stored.document), 'design-document.json')}>Export Design Document<small>Structure, technologies and layout</small></button>
        <button disabled={!model.parts.length} onClick={() => { try { download(exportDesignerSVG(stored.document), 'system-design.svg', 'image/svg+xml'); } catch (failure) { setError(message(failure)); } }}>Export SVG<small>Entire system · current lens</small></button>
      </div></details></div>
    </header>
    {error && <div className="designer-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    <div className="designer-toolbar"><div className="designer-actions"><button className="designer-primary" title="New Part (N)" onClick={() => navigate(() => setEditor({ kind: 'new-part' }))}>+ Add Part</button><button title="New Relation (R)" disabled={!model.parts.length} onClick={() => connect(selection.kind === 'part' ? selection.partId : undefined)}>+ Add Relation</button><button onClick={resetContext}>System context</button></div>
      <div className="designer-actions designer-history"><button title="Undo · Ctrl/⌘ Z" disabled={!history.past.length} onClick={() => travel('past')}>Undo</button><button title="Redo · Ctrl/⌘ Shift Z" disabled={!history.future.length} onClick={() => travel('future')}>Redo</button></div><label className="designer-find">Find Part<input aria-label="Find Part" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or technology…" /></label>
    </div>
    {search && <div className="designer-search-results" aria-label="Matching Parts">{!matches.length && <span>No Parts match “{search}”.</span>}{matches.map((part) => <button key={part.id} onClick={() => { navigate(() => { setShowNotes(false); setSelection({ kind: 'part', partId: part.id }); setEditor({ kind: 'inspect' }); setFocusRequest({ id: part.id, revision: Date.now() }); setSearch(''); }); }}>{part.label}</button>)}</div>}
    <div className="designer-body"><DesignerCanvas model={model} implementation={implementation} presentation={stored.document.presentation} selection={selection} onSelect={select} onConnect={connect} onPresentation={presentationChanged} onError={setError} focusRequest={focusRequest} addPart={() => navigate(() => setEditor({ kind: 'new-part' }))} />
      <DesignerInspector key={`${revision}:${JSON.stringify(selection)}:${JSON.stringify(editor)}`} model={model} selection={selection} editor={editor} showNotes={showNotes} implementation={implementation} commitImplementation={commitImplementation} commit={commit} select={select} closeEditor={() => navigate(() => setEditor({ kind: 'inspect' }))} connect={connect} navigate={(action) => navigate(action, false)} remove={removeSelection} />
    </div>
    <details className="designer-index"><summary>Browse system · {model.claims.length} Claims · {model.openQuestions.length} Open Questions</summary><div>
      {model.parts.map((part) => <button key={part.id} onClick={() => select({ kind: 'part', partId: part.id })}>{part.label}</button>)}
      {model.relations.map((relation) => <button key={relation.id} onClick={() => select({ kind: 'relation', relationId: relation.id })}>{relationLabel(model, relation)}</button>)}
      {model.claims.map((claim) => <button key={`claim:${claim.id}`} onClick={() => inspectNotes(claim.subject)}>{claim.modality.toUpperCase()}: {claim.statement}</button>)}
      {model.openQuestions.map((question) => <button key={`question:${question.id}`} onClick={() => inspectNotes(question.subject)}>Question: {question.question}</button>)}
    </div></details>
    <footer className="designer-shortcuts"><span>N · Part <b>R · Relation</b> / · Find <b>Esc · System</b></span><span>Ctrl/⌘ Enter · Save form · Undo available during this session</span></footer>
  </main>;
}
