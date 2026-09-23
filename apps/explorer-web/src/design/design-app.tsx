import { useEffect, useRef, useState } from 'react';
import type { PlannedSubjectRef, PlannedSystemModel } from '@bunker-code/contracts';
import { createPlannedSystemModel } from '@bunker-code/planned-system';
import { DesignerCanvas } from './designer-canvas.js';
import { DesignerInspector, Field, relationLabel, type DesignerEditor } from './designer-inspector.js';
import { deleteDesignerDocument, designerStoragePrefix, exportPlannedSystemJSON, importPlannedSystemJSON,
  readDesignerLibrary, saveDesignerDocument, type DesignerPresentation, type StoredDesignerDocument,
} from './designer-storage.js';

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function download(contents: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DesignApp() {
  const [library, setLibrary] = useState<ReturnType<typeof readDesignerLibrary>>({ documents: [], issues: [] });
  const [active, setActive] = useState<StoredDesignerDocument | null>(null);
  const [panel, setPanel] = useState<'create' | 'import' | null>(null);
  const [error, setError] = useState('');
  const [importText, setImportText] = useState('');
  const [conflict, setConflict] = useState<PlannedSystemModel | null>(null);
  function refresh() {
    try { setLibrary(readDesignerLibrary(window.localStorage)); setError(''); }
    catch (failure) { setError(`Local storage is unavailable: ${message(failure)}`); }
  }
  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  function openModel(model: PlannedSystemModel): boolean {
    try {
      const saved = saveDesignerDocument(window.localStorage, { storageVersion: 1, model, updatedAt: new Date().toISOString(), presentation: { positions: {} } }, null);
      setActive(saved); setPanel(null); setError(''); setConflict(null); setImportText(''); return true;
    } catch (failure) { setError(message(failure)); return false; }
  }
  function importModel(raw: string) {
    try {
      const model = importPlannedSystemJSON(raw);
      if (window.localStorage.getItem(designerStoragePrefix + model.id) !== null) {
        setConflict(model); setError('A local system already has this identity. You can import a separate copy with a new system identity. The existing system will be preserved.');
      } else openModel(model);
    } catch (failure) { setConflict(null); setError(message(failure)); }
  }
  if (active) return <Designer key={active.document.model.id} initial={active} back={() => { setActive(null); refresh(); }} />;
  return <main className="design-library" data-design-library>
    <header className="design-library-header"><div><p className="eyebrow">DESIGN / Your local systems</p><h1>Start with the system you intend.</h1><p>Shape its Parts, connections and decisions before the first line of code.</p></div>
      <div className="designer-actions"><button className="designer-primary" onClick={() => { setPanel('create'); setError(''); }}>New System</button><button onClick={() => { setPanel('import'); setError(''); }}>Import JSON</button></div>
    </header>
    {error && <div className="designer-error" role="alert">{error}</div>}
    {panel === 'create' && <section className="designer-library-panel"><div className="designer-section-heading"><h2>Create System</h2><button onClick={() => setPanel(null)}>Cancel</button></div>
      <form className="designer-form" onSubmit={(event) => {
        event.preventDefault();
        try { openModel(createPlannedSystemModel({ representedSystem: String(new FormData(event.currentTarget).get('name') ?? '').trim() })); }
        catch (failure) { setError(message(failure)); }
      }}><Field name="name" label="System name" required autoFocus /><button className="designer-primary" type="submit">Create System</button></form>
    </section>}
    {panel === 'import' && <section className="designer-library-panel"><div className="designer-section-heading"><h2>Import Planned System</h2><button onClick={() => { setPanel(null); setConflict(null); }}>Cancel</button></div>
      <label className="designer-field">Choose JSON file<input type="file" accept=".json,application/json" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void file.text().then((raw) => { setImportText(raw); importModel(raw); }).catch((failure: unknown) => setError(message(failure)));
      }} /></label>
      <form className="designer-form" onSubmit={(event) => { event.preventDefault(); importModel(importText); }}>
        <label className="designer-field">Or paste JSON<textarea aria-label="Planned System JSON" rows={7} value={importText} onChange={(event) => { setImportText(event.target.value); setConflict(null); }} required /></label>
        <button type="submit">Import system</button>
      </form>
      {conflict && <button className="designer-primary" onClick={() => openModel({ ...conflict, id: crypto.randomUUID() })}>Import as new system</button>}
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
    <footer className="design-library-footer">Saved in this browser · Export JSON to keep a portable backup.</footer>
  </main>;
}

function Designer({ initial, back }: { initial: StoredDesignerDocument; back(): void }) {
  const [stored, setStored] = useState(initial);
  const current = useRef(stored);
  const [selection, setSelection] = useState<PlannedSubjectRef>({ kind: 'model' });
  const [editor, setEditor] = useState<DesignerEditor>({ kind: 'inspect' });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const model = stored.document.model;
  function persist(nextModel: PlannedSystemModel, presentation: DesignerPresentation, authored: boolean): boolean {
    try {
      const next = saveDesignerDocument(window.localStorage, {
        storageVersion: 1, model: nextModel, presentation,
        updatedAt: authored ? new Date().toISOString() : current.current.document.updatedAt,
      }, current.current.raw);
      // Camera changes must not invalidate a pending semantic layout or reset author drafts.
      if (!authored) next.document.model = current.current.document.model;
      current.current = next; setStored(next); setError(''); return true;
    } catch (failure) { setError(`Not saved: ${message(failure)}`); return false; }
  }
  function commit(operation: (model: PlannedSystemModel) => PlannedSystemModel): boolean {
    try {
      const next = operation(current.current.document.model);
      const presentation = current.current.document.presentation;
      const positions = Object.fromEntries(Object.entries(presentation.positions).filter(([id]) => next.parts.some((part) => part.id === id)));
      return persist(next, { ...presentation, positions }, true);
    } catch (failure) { setError(message(failure)); return false; }
  }
  function select(subject: PlannedSubjectRef) { setSelection(subject); setEditor({ kind: 'inspect' }); }
  function connect(source?: string, target?: string) { setEditor({ kind: 'new-relation', source, target }); }
  function presentationChanged(presentation: DesignerPresentation): boolean {
    if (JSON.stringify(presentation) === JSON.stringify(current.current.document.presentation)) return true;
    return persist(current.current.document.model, presentation, false);
  }
  return <main className="designer" data-designer>
    <header className="designer-header"><div className="designer-actions"><button onClick={back}>← Systems</button><div><p className="eyebrow">Planned system</p><h1>{model.context.representedSystem}</h1></div></div>
      <div className="designer-actions"><span role="status" className={error ? 'designer-unsaved' : 'designer-saved'}>{error ? 'Needs attention' : 'Saved locally'}</span><button onClick={() => download(exportPlannedSystemJSON(model), 'planned-system.json')}>Export JSON</button></div>
    </header>
    {error && <div className="designer-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    <div className="designer-toolbar"><div className="designer-actions"><button className="designer-primary" onClick={() => setEditor({ kind: 'new-part' })}>+ Add Part</button><button disabled={!model.parts.length} onClick={() => connect(selection.kind === 'part' ? selection.partId : undefined)}>+ Add Relation</button><button onClick={() => select({ kind: 'model' })}>System context</button></div>
      <label className="designer-find">Find Part<input aria-label="Find Part" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name…" /></label>
    </div>
    {search && <div className="designer-search-results">{model.parts.filter((part) => part.label.toLowerCase().includes(search.toLowerCase())).map((part) => <button key={part.id} onClick={() => { select({ kind: 'part', partId: part.id }); setSearch(''); }}>{part.label}</button>)}</div>}
    <div className="designer-body"><DesignerCanvas model={model} presentation={stored.document.presentation} selection={selection} onSelect={select} onConnect={connect} onPresentation={presentationChanged} onError={setError} />
      <DesignerInspector key={`${JSON.stringify(selection)}:${JSON.stringify(editor)}`} model={model} selection={selection} editor={editor} commit={commit} select={select} closeEditor={() => setEditor({ kind: 'inspect' })} connect={connect} />
    </div>
    <details className="designer-index"><summary>System index · {model.claims.length} Claims · {model.openQuestions.length} Open Questions</summary><div>
      {model.parts.map((part) => <button key={part.id} onClick={() => select({ kind: 'part', partId: part.id })}>{part.label}</button>)}
      {model.relations.map((relation) => <button key={relation.id} onClick={() => select({ kind: 'relation', relationId: relation.id })}>{relationLabel(model, relation)}</button>)}
      {model.claims.map((claim) => <button key={`claim:${claim.id}`} onClick={() => select(claim.subject)}>{claim.modality.toUpperCase()}: {claim.statement}</button>)}
      {model.openQuestions.map((question) => <button key={`question:${question.id}`} onClick={() => select(question.subject)}>Question: {question.question}</button>)}
    </div></details>
  </main>;
}
