import { useRef, useState } from "react";
import { Excalidraw, serializeAsJSON, restore } from "@excalidraw/excalidraw";
import { addDecision, addEntity, CONSIDERATIONS, reconcileCanvasElements, SEMANTIC_KINDS, updateEntity, type DesignDocument, type DesignEntity, type SemanticKind, type SystemContext } from "@bunker-code/design-model";
import { loadStudio, saveStudio } from "./storage";

type Scene = Parameters<typeof restore>[0];
type CanvasChange = NonNullable<React.ComponentProps<typeof Excalidraw>["onChange"]>;
type CanvasElements = Parameters<CanvasChange>[0];
type CanvasState = Parameters<CanvasChange>[1];
type CanvasFiles = Parameters<CanvasChange>[2];

function initialStudio() {
  try { return { ...loadStudio(), error: "" }; }
  catch (error) { return { design: null, scene: null, error: error instanceof Error ? error.message : "Unable to load Studio." }; }
}

const contextFields: ReadonlyArray<[keyof SystemContext, string]> = [
  ["systemName", "System name"], ["purpose", "Purpose"],
  ["registeredUsers", "Registered users"], ["dailyActiveUsers", "Daily active users"],
  ["peakConcurrentUsers", "Peak concurrent users"], ["peakRequestsPerSecond", "Peak requests per second"],
  ["availabilityTarget", "Availability target"], ["latencyTarget", "Latency target"],
  ["dataSensitivity", "Data sensitivity"], ["budgetConstraint", "Budget constraint"],
  ["deploymentConstraint", "Deployment constraint"],
];

export function Studio() {
  const initial = useRef(initialStudio());
  const [design, setDesign] = useState<DesignDocument | null>(initial.current.design);
  const designRef = useRef(design);
  const sceneRef = useRef<string | null>(initial.current.scene === null ? null : JSON.stringify(initial.current.scene));
  const [error, setError] = useState(initial.current.error);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"entity" | "context" | null>(null);
  const [kindPicker, setKindPicker] = useState(false);

  if (!design) return <div className="studio-recovery" role="alert"><h1>Studio could not open saved work</h1><p>{error}</p><p>The saved document remains in this browser. Nothing was overwritten.</p></div>;

  function currentDesign(): DesignDocument {
    if (!designRef.current) throw new Error("Studio document is unavailable.");
    return designRef.current;
  }

  function commit(next: DesignDocument) {
    designRef.current = next;
    setDesign(next);
    try { saveStudio(next, sceneRef.current); setError(""); }
    catch (cause) { setError(cause instanceof Error ? `Could not save locally: ${cause.message}` : "Could not save locally."); }
  }

  function handleCanvasChange(elements: CanvasElements, appState: CanvasState, files: CanvasFiles) {
    const selected = elements.filter((element) => !element.isDeleted && appState.selectedElementIds[element.id] &&
      ["rectangle", "ellipse", "diamond", "frame"].includes(element.type));
    const totalSelected = Object.values(appState.selectedElementIds).filter(Boolean).length;
    const nextId = totalSelected === 1 && selected.length === 1 ? selected[0]?.id ?? null : null;
    setSelectedId((current) => current === nextId ? current : nextId);
    sceneRef.current = serializeAsJSON(elements, appState, files, "local");
    const live = new Set(elements.filter((element) => !element.isDeleted).map((element) => element.id));
    const next = reconcileCanvasElements(currentDesign(), live);
    if (next !== designRef.current) { designRef.current = next; setDesign(next); }
    try { saveStudio(next, sceneRef.current); setError(""); }
    catch (cause) { setError(cause instanceof Error ? `Could not save locally: ${cause.message}` : "Could not save locally."); }
  }

  const selectedEntity = design.entities.find((entity) => entity.canvasElementId === selectedId);
  function makeSemantic(kind: SemanticKind) {
    if (!selectedId) return;
    commit(addEntity(currentDesign(), selectedId, kind));
    setKindPicker(false);
    setPanel("entity");
  }
  function editEntity(entity: DesignEntity) { commit(updateEntity(currentDesign(), entity)); }
  function editContext(key: keyof SystemContext, value: string) {
    const current = currentDesign();
    commit({ ...current, systemContext: { ...current.systemContext, [key]: value } });
  }

  return <div className="studio-shell">
    <Excalidraw
      theme="light"
      initialData={initial.current.scene === null ? undefined : restore(initial.current.scene as Scene, null, null)}
      onChange={handleCanvasChange}
      renderTopRightUI={() => <div className="studio-controls">
        <span className="studio-brand">BunkerCode <strong>DESIGN</strong></span>
        <button onClick={() => { setPanel("context"); setKindPicker(false); }}>System Context</button>
      </div>}
    />
    {selectedId && !panel && <div className="selection-action">
      {selectedEntity ? <button onClick={() => setPanel("entity")}>Open system meaning</button> : <button onClick={() => setKindPicker(!kindPicker)}>Add system meaning</button>}
      {kindPicker && !selectedEntity && <div className="kind-menu" role="menu" aria-label="Choose system meaning">
        {SEMANTIC_KINDS.map((kind) => <button key={kind} onClick={() => makeSemantic(kind)}>{kind}</button>)}
      </div>}
    </div>}
    {panel && <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
      <section className="detail-panel" role="dialog" aria-modal="true" aria-label={panel === "context" ? "System Context" : "System meaning"}>
        <header><div><small>BunkerCode DESIGN</small><h2>{panel === "context" ? "System Context" : "System meaning"}</h2></div><button className="close-button" aria-label="Close details" onClick={() => setPanel(null)}>×</button></header>
        {panel === "context" ? <div className="field-list">
          <p className="subtle">Optional context for this design. Keep drawing whenever you like.</p>
          {contextFields.map(([key, label], index) => <label key={key}>{index === 2 && <h3>Scale assumptions</h3>}{index === 6 && <h3>Requirements / constraints</h3>}{label}
            {key === "purpose" ? <textarea value={design.systemContext[key]} onChange={(event) => editContext(key, event.target.value)} /> :
              <input value={design.systemContext[key]} onChange={(event) => editContext(key, event.target.value)} />}
          </label>)}
        </div> : selectedEntity ? <div className="field-list">
          <label>Name<input value={selectedEntity.name} onChange={(event) => editEntity({ ...selectedEntity, name: event.target.value })} /></label>
          <label>Kind<select value={selectedEntity.kind} onChange={(event) => editEntity({ ...selectedEntity, kind: event.target.value as SemanticKind })}>{SEMANTIC_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <label>Technology <span className="optional">optional</span><input value={selectedEntity.technology ?? ""} onChange={(event) => editEntity({ ...selectedEntity, technology: event.target.value })} /></label>
          <label>Purpose<textarea value={selectedEntity.purpose} onChange={(event) => editEntity({ ...selectedEntity, purpose: event.target.value })} /></label>
          <label>Notes<textarea value={selectedEntity.notes} onChange={(event) => editEntity({ ...selectedEntity, notes: event.target.value })} /></label>
          <div className="section-heading"><h3>Decisions</h3><button onClick={() => commit(addDecision(currentDesign(), selectedEntity.id))}>Add decision</button></div>
          {selectedEntity.decisions.map((decision) => <div className="decision" key={decision.id}>
            <label>Title<input value={decision.title} onChange={(event) => editEntity({ ...selectedEntity, decisions: selectedEntity.decisions.map((item) => item.id === decision.id ? { ...item, title: event.target.value } : item) })} /></label>
            <label>Reason<textarea value={decision.reason} onChange={(event) => editEntity({ ...selectedEntity, decisions: selectedEntity.decisions.map((item) => item.id === decision.id ? { ...item, reason: event.target.value } : item) })} /></label>
            <label>Status<select value={decision.status} onChange={(event) => editEntity({ ...selectedEntity, decisions: selectedEntity.decisions.map((item) => item.id === decision.id ? { ...item, status: event.target.value as typeof decision.status } : item) })}><option value="open">open</option><option value="accepted">accepted</option><option value="rejected">rejected</option></select></label>
            <button className="text-button" onClick={() => editEntity({ ...selectedEntity, decisions: selectedEntity.decisions.filter((item) => item.id !== decision.id) })}>Remove decision</button>
          </div>)}
          <div className="considerations"><h3>Things to consider</h3><p className="subtle">Prompts for your thinking. No response is required.</p><ul>{CONSIDERATIONS[selectedEntity.kind].map((question) => <li key={question}>{question}</li>)}</ul></div>
        </div> : <p>This shape no longer exists. Close this panel and select another shape.</p>}
      </section>
    </div>}
    {error && <div className="save-error" role="alert">{error}</div>}
  </div>;
}
