import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Connection, type Viewport } from "@xyflow/react";
import { addDecision, commitHistory, createDesignDocument, createEntity, createHistory, createLayoutDocument, createRelationship, deleteEntity, deleteRelationship, discardLastHistory, duplicateEntity, redoHistory, RELATIONSHIP_KINDS, replacePresentHistory, setConsiderationStatus, undoHistory, updateEntity, updateRelationship,
  type DesignDocument, type DesignHistory, type DesignSnapshot, type LayoutDocument, type SemanticKind, type SystemContext } from "@bunker-code/design-model";
import { EDGE_TYPES, NODE_TYPES, projectEdges, projectNodes, type StudioEdge, type StudioNode } from "./studio-projection";
import { CONCEPT_LANGUAGE, CREATION_ORDER, RELATIONSHIP_LANGUAGE } from "./studio-language";
import { StudioPanelView, type StudioPanel } from "./studio-panels";
import { loadStudio, saveStudio } from "./storage";

type Selection = { type: "node" | "edge"; id: string } | null;
type CreateMenu = { x: number; y: number; flowX: number; flowY: number } | null;
type ConnectionMenu = { x: number; y: number; relationshipId: string } | null;
type Editing = { id: string; isNew: boolean } | null;

function initialState(): { history: DesignHistory; error: string | null } {
  try { return { history: createHistory(loadStudio()), error: null }; }
  catch (error) { return { history: createHistory({ design: createDesignDocument(), layout: createLayoutDocument() }), error: error instanceof Error ? error.message : "Não foi possível abrir os dados locais do Studio." }; }
}

export function Studio() {
  const [initial] = useState(initialState);
  if (initial.error) return <div className="studio-recovery" role="alert"><h1>Não foi possível abrir o trabalho salvo</h1><p>Os dados deste navegador não foram alterados.</p><details><summary>Detalhes do erro</summary><p>{initial.error}</p></details></div>;
  return <ReactFlowProvider><StudioCanvas initial={initial.history} /></ReactFlowProvider>;
}

function StudioCanvas({ initial }: { initial: DesignHistory }) {
  const [history, setHistory] = useState(initial);
  const historyRef = useRef(history);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const editingRef = useRef<Editing>(null);
  const [createMenu, setCreateMenu] = useState<CreateMenu>(null);
  const [connectionMenu, setConnectionMenu] = useState<ConnectionMenu>(null);
  const [panel, setPanel] = useState<StudioPanel | null>(null);
  const lastPointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const lastPaneClick = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastNodeClick = useRef<{ time: number; id: string } | null>(null);
  const flow = useReactFlow<StudioNode, StudioEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<StudioEdge>([]);

  const commit = useCallback((next: DesignSnapshot) => {
    const updated = commitHistory(historyRef.current, next);
    historyRef.current = updated;
    setHistory(updated);
  }, []);
  const replacePresent = useCallback((next: DesignSnapshot) => {
    const updated = replacePresentHistory(historyRef.current, next);
    historyRef.current = updated;
    setHistory(updated);
  }, []);
  const startEditing = useCallback((next: Editing) => { editingRef.current = next; setEditing(next); }, []);
  const commitDesign = useCallback((design: DesignDocument) => commit({ design, layout: historyRef.current.present.layout }), [commit]);
  const current = () => historyRef.current.present;
  const closeTransient = useCallback(() => { setCreateMenu(null); setConnectionMenu(null); setPanel(null); }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { try { saveStudio(history.present); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar os dados locais."); } }, 220);
    const flush = () => { window.clearTimeout(timeout); try { saveStudio(historyRef.current.present); } catch { /* The visible error is set by the scheduled write. */ } };
    window.addEventListener("pagehide", flush);
    return () => { window.clearTimeout(timeout); window.removeEventListener("pagehide", flush); };
  }, [history.present]);

  const rename = useCallback((id: string, name: string) => {
    if (editingRef.current?.id !== id) return;
    const snapshot = historyRef.current.present;
    const entity = snapshot.design.entities.find((item) => item.id === id);
    if (!entity) return;
    if (!name.trim()) return;
    const next = { ...snapshot, design: updateEntity(snapshot.design, { ...entity, name: name.trim() }) };
    if (editingRef.current.isNew) replacePresent(next); else commit(next);
    startEditing(null); setSelection({ type: "node", id });
  }, [commit, replacePresent, startEditing]);
  const cancelRename = useCallback((id: string) => {
    if (editingRef.current?.id !== id) return;
    if (editingRef.current.isNew) {
      const updated = discardLastHistory(historyRef.current);
      historyRef.current = updated; setHistory(updated); setSelection(null);
    }
    startEditing(null);
  }, [startEditing]);
  const nodeAction = useCallback((id: string, action: "details" | "considerations" | "decision" | "duplicate") => {
    if (action === "duplicate") {
      const snapshot = historyRef.current.present;
      const result = duplicateEntity(snapshot.design, id);
      const original = snapshot.layout.nodes.find((node) => node.entityId === id);
      if (!original) return;
      commit({ design: result.document, layout: { ...snapshot.layout, nodes: [...snapshot.layout.nodes, { entityId: result.entity.id, x: original.x + 44, y: original.y + 44 }] } });
      setSelection({ type: "node", id: result.entity.id });
      return;
    }
    setPanel({ type: action, entityId: id });
  }, [commit]);
  const edgeAction = useCallback((id: string, action: "edit" | "delete") => {
    if (action === "edit") { setPanel({ type: "relationship", relationshipId: id }); return; }
    const snapshot = historyRef.current.present;
    commit({ ...snapshot, design: deleteRelationship(snapshot.design, id) });
    setSelection(null);
  }, [commit]);

  const selectedNodeId = selection?.type === "node" ? selection.id : null;
  const selectedEdgeId = selection?.type === "edge" ? selection.id : null;
  useEffect(() => {
    setNodes(projectNodes(history.present.design, history.present.layout, selectedNodeId, editing?.id ?? null, rename, cancelRename, nodeAction));
    setEdges(projectEdges(history.present.design, selectedEdgeId, edgeAction));
  }, [history.present, selectedNodeId, selectedEdgeId, editing?.id, rename, cancelRename, nodeAction, edgeAction, setNodes, setEdges]);

  function openCreateAt(clientX: number, clientY: number) {
    const position = flow.screenToFlowPosition({ x: clientX, y: clientY });
    setCreateMenu({ x: Math.min(clientX, window.innerWidth - 330), y: Math.min(clientY, window.innerHeight - 490), flowX: position.x, flowY: position.y });
    setConnectionMenu(null); setPanel(null); setSelection(null);
  }
  function createAt(kind: SemanticKind) {
    if (!createMenu) return;
    const snapshot = current();
    const result = createEntity(snapshot.design, kind);
    commit({ design: result.document, layout: { ...snapshot.layout, nodes: [...snapshot.layout.nodes, { entityId: result.entity.id, x: createMenu.flowX - 105, y: createMenu.flowY - 38 }] } });
    setCreateMenu(null); startEditing({ id: result.entity.id, isNew: true });
  }
  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const snapshot = current();
    const result = createRelationship(snapshot.design, connection.source, connection.target);
    commit({ ...snapshot, design: result.document });
    setSelection(null);
    setConnectionMenu({ x: Math.min(lastPointer.current.x, window.innerWidth - 330), y: Math.min(lastPointer.current.y, window.innerHeight - 440), relationshipId: result.relationship.id });
  }
  function classifyConnection(kind: typeof RELATIONSHIP_KINDS[number]) {
    if (!connectionMenu) return;
    const snapshot = current();
    const relationship = snapshot.design.relationships.find((item) => item.id === connectionMenu.relationshipId);
    if (relationship && relationship.kind !== kind) replacePresent({ ...snapshot, design: updateRelationship(snapshot.design, { ...relationship, kind }) });
    setConnectionMenu(null);
  }
  function deleteSelection() {
    if (!selection) return;
    const snapshot = current();
    if (selection.type === "node") commit({ design: deleteEntity(snapshot.design, selection.id), layout: { ...snapshot.layout, nodes: snapshot.layout.nodes.filter((node) => node.entityId !== selection.id) } });
    else commit({ ...snapshot, design: deleteRelationship(snapshot.design, selection.id) });
    lastNodeClick.current = null;
    setSelection(null);
  }
  function moveDone() {
    const snapshot = current();
    const positions = new Map(flow.getNodes().map((node) => [node.id, node.position]));
    const moved = snapshot.layout.nodes.some((node) => { const point = positions.get(node.entityId); return point && (point.x !== node.x || point.y !== node.y); });
    if (!moved) return;
    commit({ ...snapshot, layout: { ...snapshot.layout, nodes: snapshot.layout.nodes.map((node) => { const point = positions.get(node.entityId); return point ? { entityId: node.entityId, x: point.x, y: point.y } : node; }) } });
  }
  function viewportDone(_event: MouseEvent | TouchEvent | null, viewport: Viewport) {
    const old = historyRef.current;
    if (old.present.layout.viewport.x === viewport.x && old.present.layout.viewport.y === viewport.y && old.present.layout.viewport.zoom === viewport.zoom) return;
    const updated = { ...old, present: { ...old.present, layout: { ...old.present.layout, viewport } } };
    historyRef.current = updated; setHistory(updated);
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true']");
      if (event.key === "Escape") {
        if (panel || createMenu || connectionMenu) { event.preventDefault(); closeTransient(); }
        else if (!typing) setSelection(null);
        return;
      }
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
        event.preventDefault();
        const redo = event.key.toLowerCase() === "y" || event.shiftKey;
        const updated = redo ? redoHistory(historyRef.current) : undoHistory(historyRef.current);
        historyRef.current = updated; setHistory(updated); setSelection(null); lastNodeClick.current = null; closeTransient(); startEditing(null);
      } else if ((event.key === "Delete" || event.key === "Backspace") && !panel && !createMenu && !connectionMenu) { event.preventDefault(); deleteSelection(); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selection?.type === "node") { event.preventDefault(); nodeAction(selection.id, "duplicate"); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [panel, createMenu, connectionMenu, selection, closeTransient, nodeAction, startEditing]);

  return <div className="studio-shell" onMouseMove={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }}>
    <ReactFlow<StudioNode, StudioEdge> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onConnect={onConnect} onNodeDragStop={moveDone} onMoveEnd={viewportDone} defaultViewport={initial.present.layout.viewport}
      onPaneClick={(event) => {
        const previous = lastPaneClick.current;
        const now = Date.now();
        if (previous && now - previous.time < 400 && Math.hypot(previous.x - event.clientX, previous.y - event.clientY) < 10) {
          lastPaneClick.current = null;
          openCreateAt(event.clientX, event.clientY);
        } else {
          lastPaneClick.current = { time: now, x: event.clientX, y: event.clientY };
          setSelection(null); setCreateMenu(null);
        }
      }}
      onNodeClick={(_event, node) => {
        const previous = lastNodeClick.current;
        const now = Date.now();
        if (previous?.id === node.id && now - previous.time < 400) { lastNodeClick.current = null; startEditing({ id: node.id, isNew: false }); setSelection(null); }
        else { lastNodeClick.current = { id: node.id, time: now }; setSelection({ type: "node", id: node.id }); }
        setCreateMenu(null); setConnectionMenu(null);
      }}
      onNodeDoubleClick={(event, node) => { event.stopPropagation(); startEditing({ id: node.id, isNew: false }); setSelection(null); }}
      onEdgeClick={(_event, edge) => { setSelection({ type: "edge", id: edge.id }); setCreateMenu(null); setConnectionMenu(null); }}
      deleteKeyCode={null} zoomOnDoubleClick={false} snapToGrid={false} panOnScroll={false} selectionOnDrag={false} fitView={false} minZoom={0.25} maxZoom={2.5}
      proOptions={{ hideAttribution: true }} aria-label="Canvas de design do BunkerCode" />
    <div className="studio-header"><span className="studio-brand">BunkerCode <strong>DESIGN</strong></span><div className="header-actions">
      <button onClick={() => { closeTransient(); setSelection(null); setPanel({ type: "glossary" }); }}>Conceitos</button>
      <button onClick={() => { closeTransient(); setSelection(null); setPanel({ type: "context" }); }}>Contexto do sistema</button>
    </div></div>
    {history.present.design.entities.length === 0 && <div className="empty-guidance"><h1>Comece pelo que você já sabe.</h1><p>Quem usa esse sistema?<br />Por onde algo entra?<br />O que precisa acontecer?<br />Alguma informação precisa ser guardada?</p>
      <button onClick={() => openCreateAt(window.innerWidth / 2, window.innerHeight / 2)}>Adicionar primeira parte</button><small>Você não precisa saber arquitetura para começar.</small></div>}
    <button className="add-button" aria-label="Adicionar ao sistema" title="Adicionar ao sistema" onClick={() => openCreateAt(window.innerWidth / 2, window.innerHeight / 2)}>+</button>
    <div className="zoom-hint">Roda do mouse para aproximar · arraste o espaço vazio para mover</div>
    {createMenu && <><div className="menu-dismiss" onMouseDown={() => setCreateMenu(null)} /><div className="create-menu floating-menu" style={{ left: Math.max(8, createMenu.x), top: Math.max(8, createMenu.y) }} role="menu" aria-label="O que você quer adicionar?">
      <h2>O que você quer adicionar?</h2>{CREATION_ORDER.map((kind) =>
        <button key={kind} role="menuitem" onClick={() => createAt(kind)}><strong>{CONCEPT_LANGUAGE[kind].action}</strong><small>{CONCEPT_LANGUAGE[kind].examples}</small><span className="menu-technical">{CONCEPT_LANGUAGE[kind].technical}</span></button>)}
    </div></>}
    {connectionMenu && <><div className="menu-dismiss" onMouseDown={() => setConnectionMenu(null)} /><div className="connection-menu floating-menu" style={{ left: Math.max(8, connectionMenu.x), top: Math.max(8, connectionMenu.y) }} role="menu" aria-label="Significado da relação">
      <h2>O que esta conexão significa?</h2>{RELATIONSHIP_KINDS.filter((kind) => kind !== "generic").map((kind) => <button key={kind} role="menuitem" onClick={() => classifyConnection(kind)}><strong>{RELATIONSHIP_LANGUAGE[kind].label}</strong><small>{RELATIONSHIP_LANGUAGE[kind].explanation}</small></button>)}
      <button role="menuitem" onClick={() => classifyConnection("generic")}><strong>{RELATIONSHIP_LANGUAGE.generic.label}</strong><small>{RELATIONSHIP_LANGUAGE.generic.explanation}</small></button>
    </div></>}
    {panel && <StudioPanelView key={`${panel.type}-${"entityId" in panel ? panel.entityId : "relationshipId" in panel ? panel.relationshipId : "context"}`} panel={panel} design={history.present.design}
      onClose={() => setPanel(null)} onPanel={setPanel}
      onContext={(context: SystemContext) => { const snapshot = current(); commitDesign({ ...snapshot.design, systemContext: context }); }}
      onEntity={(entity) => { const snapshot = current(); commitDesign(updateEntity(snapshot.design, entity)); }}
      onConsideration={(entityId, itemId, status) => { const snapshot = current(); commitDesign(setConsiderationStatus(snapshot.design, entityId, itemId, status)); }}
      onDecision={(entityId, title, reason, status) => { const snapshot = current(); commitDesign(addDecision(snapshot.design, entityId, title, reason, status)); }}
      onRelationship={(relationship) => { const snapshot = current(); commitDesign(updateRelationship(snapshot.design, relationship)); }} />}
    {error && <div className="save-error" role="alert">Não foi possível salvar neste navegador: {error}</div>}
  </div>;
}
