import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getDependencies, getDependents } from '@bunker-code/graph-engine';
import type { ProjectGraph, ProjectGraphEdge, ProjectGraphNode } from '@bunker-code/graph-engine';
import snapshot from './generated/analyzer-typescript.snapshot.json';
import {
  createExplorerElements,
  layoutExplorerElements,
  type ExplorerElements,
  type ExplorerNode,
  type ExplorerNodeData,
} from './explorer-model.js';
import { createExplorerProjection, type ExplorerState } from './explorer-projection.js';
import { createExplorerRuntime, type ExplorerRuntimeState } from './explorer-runtime.js';
import { searchExplorerFiles } from './explorer-search.js';
import './styles.css';

const nodeTypes = { explorer: ExplorerNodeView };

function App() {
  const [runtime, setRuntime] = useState<ExplorerRuntimeState>({ kind: 'loading' });

  useEffect(() => {
    setRuntime(createExplorerRuntime(snapshot));
  }, []);

  if (runtime.kind === 'loading') {
    return <StatusScreen title="Loading snapshot" message="Preparing the structural explorer." />;
  }

  if (runtime.kind === 'invalid-snapshot') {
    return <StatusScreen title="Snapshot unavailable" message={runtime.message} />;
  }

  if (runtime.kind === 'empty-graph') {
    return <StatusScreen title="No files to explore" message="The loaded snapshot does not contain internal files." />;
  }

  return <Explorer graph={runtime.graph} />;
}

function Explorer({ graph }: { graph: ProjectGraph }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');
  const explorationState: ExplorerState = { selectedNodeId, focusedNodeId, expandedNodeIds };
  const projection = useMemo(
    () => createExplorerProjection(graph, explorationState),
    [graph, focusedNodeId, expandedNodeIds],
  );
  const projectedElements = useMemo(() => createExplorerElements(projection), [projection]);
  const [elements, setElements] = useState<ExplorerElements>(projectedElements);
  const searchResults = useMemo(() => searchExplorerFiles(graph, searchQuery), [graph, searchQuery]);

  useEffect(() => {
    let active = true;
    setLayoutState('loading');

    void layoutExplorerElements(projectedElements).then((nextElements) => {
      if (!active) {
        return;
      }

      setElements(nextElements);
      setLayoutState('ready');
      window.requestAnimationFrame(() => reactFlow?.fitView({ padding: 0.2, duration: 150 }));
    }).catch(() => {
      if (active) {
        setLayoutState('error');
      }
    });

    return () => {
      active = false;
    };
  }, [projectedElements, reactFlow]);

  useEffect(() => {
    if (!pendingCenterNodeId || !reactFlow || !elements.nodes.some((node) => node.id === pendingCenterNodeId)) {
      return;
    }

    window.requestAnimationFrame(() => {
      reactFlow.fitView({ nodes: [{ id: pendingCenterNodeId }], padding: 1, duration: 150, maxZoom: 1.2 });
      setPendingCenterNodeId(null);
    });
  }, [elements.nodes, pendingCenterNodeId, reactFlow]);

  const focusedDependencies = useMemo(
    () => focusedNodeId ? new Set(getDependencies(graph, focusedNodeId).map((edge) => edge.targetNodeId)) : new Set<string>(),
    [graph, focusedNodeId],
  );
  const focusedDependents = useMemo(
    () => focusedNodeId ? new Set(getDependents(graph, focusedNodeId).map((edge) => edge.sourceNodeId)) : new Set<string>(),
    [graph, focusedNodeId],
  );
  const flowNodes: Node<ExplorerNodeData>[] = useMemo(
    () => elements.nodes.map((node) => ({
      ...node,
      type: 'explorer',
      data: {
        ...node.data,
        contextLabel: nodeContextLabel(node, selectedNodeId, focusedNodeId, focusedDependencies, focusedDependents),
      },
      className: nodeClassName(node, selectedNodeId, focusedNodeId, focusedDependencies, focusedDependents),
    })),
    [elements.nodes, selectedNodeId, focusedNodeId, focusedDependencies, focusedDependents],
  );
  const flowEdges: Edge[] = useMemo(
    () => elements.edges.map((edge) => ({
      ...edge,
      className: edge.source === selectedNodeId || edge.target === selectedNodeId ? 'graph-edge-active' : 'graph-edge',
    })),
    [elements.edges, selectedNodeId],
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const dependencies = selectedNodeId ? getDependencies(graph, selectedNodeId) : [];
  const dependents = selectedNodeId ? getDependents(graph, selectedNodeId) : [];
  const canFocus = selectedNode?.kind === 'file' && selectedNode.id !== focusedNodeId;
  const canExpand = selectedNode?.kind === 'file'
    && projection.mode === 'focus'
    && projection.visibleNodeIds.has(selectedNode.id)
    && !expandedNodeIds.has(selectedNode.id)
    && hasHiddenDirectContext(graph, selectedNode.id, projection.visibleNodeIds);

  function focusSelectedFile(): void {
    if (selectedNode?.kind !== 'file') {
      return;
    }

    setFocusedNodeId(selectedNode.id);
    setExpandedNodeIds(new Set());
    setPendingCenterNodeId(selectedNode.id);
  }

  function expandSelectedNode(): void {
    if (!canExpand || !selectedNode) {
      return;
    }

    setExpandedNodeIds((current) => new Set([...current, selectedNode.id]));
  }

  function returnToOverview(): void {
    setFocusedNodeId(null);
    setExpandedNodeIds(new Set());
    if (selectedNode?.kind === 'external') {
      setSelectedNodeId(null);
    }
  }

  function selectSearchResult(nodeId: string): void {
    if (!projection.visibleNodeIds.has(nodeId)) {
      setFocusedNodeId(null);
      setExpandedNodeIds(new Set());
    }

    setSelectedNodeId(nodeId);
    setPendingCenterNodeId(nodeId);
    setSearchQuery('');
  }

  function fitCurrentGraph(): void {
    reactFlow?.fitView({ padding: 0.2, duration: 150 });
  }

  function centerSelectedNode(): void {
    if (selectedNode && projection.visibleNodeIds.has(selectedNode.id)) {
      setPendingCenterNodeId(selectedNode.id);
    }
  }

  return (
    <main className="explorer-shell">
      <header className="explorer-header">
        <div>
          <p className="eyebrow">BunkerCode</p>
          <h1>Structural Explorer</h1>
        </div>
        <div className="explorer-header-actions">
          <label className="search-control">
            <span>Find file</span>
            <input
              aria-label="Find file"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Path or file name"
            />
            {searchQuery.trim() ? (
              <SearchResults results={searchResults} onSelect={selectSearchResult} />
            ) : null}
          </label>
          <button type="button" onClick={fitCurrentGraph}>Fit graph</button>
          {selectedNode && projection.visibleNodeIds.has(selectedNode.id) ? (
            <button type="button" onClick={centerSelectedNode}>Center selected</button>
          ) : null}
          {projection.mode === 'focus' ? <button type="button" onClick={returnToOverview}>Overview</button> : null}
        </div>
      </header>
      <section className="explorer-main" aria-label="Project graph explorer">
        <div className="graph-canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.25}
            onInit={setReactFlow}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {layoutState === 'loading' ? <div className="graph-status">Arranging visible graph...</div> : null}
          {layoutState === 'error' ? (
            <div className="graph-status graph-status-error">Unable to arrange this graph. The analytical data remains unchanged.</div>
          ) : null}
        </div>
        <aside className="details-panel" aria-live="polite">
          {selectedNode ? (
            <>
              <p className="eyebrow">{selectedNode.kind === 'file' ? 'Selected file' : 'Selected external module'}</p>
              <h2>{nodeLabel(selectedNode)}</h2>
              <dl>
                <div><dt>ID</dt><dd>{selectedNode.id}</dd></div>
                <div><dt>Type</dt><dd>{selectedNode.kind}</dd></div>
                <div><dt>Dependencies</dt><dd>{dependencies.length}</dd></div>
                <div><dt>Dependents</dt><dd>{dependents.length}</dd></div>
              </dl>
              <div className="details-actions">
                {canFocus ? <button type="button" onClick={focusSelectedFile}>Focus file</button> : null}
                {canExpand ? <button type="button" onClick={expandSelectedNode}>Expand context</button> : null}
              </div>
              <RelationList title="Dependencies" edges={dependencies} />
              <RelationList title="Dependents" edges={dependents} />
            </>
          ) : (
            <div className="empty-details">
              <p className="eyebrow">{projection.mode === 'focus' ? 'Focus context' : 'Overview'}</p>
              <h2>{projection.nodes.length} visible nodes</h2>
              <p>Find a file, select it, then focus or expand its direct structural context.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function ExplorerNodeView({ data }: NodeProps<ExplorerNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <strong className="graph-node-label" title={data.label}>{data.label}</strong>
      <span className="graph-node-subtitle" title={data.subtitle}>{data.subtitle}</span>
      {data.contextLabel ? <span className="graph-node-context">{data.contextLabel}</span> : null}
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function SearchResults({
  results,
  onSelect,
}: {
  results: ReturnType<typeof searchExplorerFiles>;
  onSelect(nodeId: string): void;
}) {
  if (results.length === 0) {
    return <p className="search-empty">No internal files match this search.</p>;
  }

  return (
    <ul className="search-results" aria-label="File search results">
      {results.map((result) => (
        <li key={result.nodeId}>
          <button type="button" data-search-result={result.nodeId} onClick={() => onSelect(result.nodeId)}>
            <strong>{result.fileName}</strong>
            <span>{result.path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="status-screen">
      <p className="eyebrow">BunkerCode Explorer</p>
      <h1>{title}</h1>
      <p>{message}</p>
    </main>
  );
}

function nodeClassName(
  node: Node<ExplorerNodeData>,
  selectedNodeId: string | null,
  focusedNodeId: string | null,
  focusedDependencies: ReadonlySet<string>,
  focusedDependents: ReadonlySet<string>,
): string {
  const classes = ['graph-node'];

  if (node.data.kind === 'external') classes.push('graph-node-external');
  if (node.id === focusedNodeId) classes.push('graph-node-target');
  else if (focusedDependencies.has(node.id)) classes.push('graph-node-dependency');
  else if (focusedDependents.has(node.id)) classes.push('graph-node-dependent');
  if (node.id === selectedNodeId) classes.push('graph-node-selected');

  return classes.join(' ');
}

function nodeContextLabel(
  node: Node<ExplorerNodeData>,
  selectedNodeId: string | null,
  focusedNodeId: string | null,
  focusedDependencies: ReadonlySet<string>,
  focusedDependents: ReadonlySet<string>,
): string | undefined {
  const labels: string[] = [];

  if (node.id === focusedNodeId) labels.push('Focus target');
  else if (focusedDependencies.has(node.id)) labels.push('Direct dependency');
  else if (focusedDependents.has(node.id)) labels.push('Direct dependent');
  if (node.data.kind === 'external') labels.push('External module');
  if (node.id === selectedNodeId) labels.push('Selected');

  return labels.length > 0 ? labels.join(' · ') : undefined;
}

function hasHiddenDirectContext(graph: ProjectGraph, nodeId: string, visibleNodeIds: ReadonlySet<string>): boolean {
  return [...getDependencies(graph, nodeId), ...getDependents(graph, nodeId)].some((edge) => (
    !visibleNodeIds.has(edge.sourceNodeId) || !visibleNodeIds.has(edge.targetNodeId)
  ));
}

function nodeLabel(node: ProjectGraphNode): string {
  return node.kind === 'file' ? node.path : node.moduleSpecifier;
}

function relationLabel(edge: ProjectGraphEdge): string {
  const location = edge.evidence.location;
  return `${edge.moduleSpecifier} at ${location.filePath}:${location.line}:${location.column} (${edge.confidence})`;
}

function RelationList({ title, edges }: { title: string; edges: ProjectGraphEdge[] }) {
  return (
    <section className="relation-list">
      <h3>{title}</h3>
      {edges.length === 0 ? <p className="muted">None</p> : (
        <ul>
          {edges.map((edge) => <li key={edge.id}>{relationLabel(edge)}</li>)}
        </ul>
      )}
    </section>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Explorer root element not found.');
}

createRoot(root).render(<App />);
