import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Background, Controls, ReactFlow, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildProjectGraph, getDependencies, getDependents } from '@bunker-code/graph-engine';
import type { AnalysisResult } from '@bunker-code/contracts';
import type { ProjectGraphEdge, ProjectGraphNode } from '@bunker-code/graph-engine';
import snapshot from './generated/analyzer-typescript.snapshot.json';
import { createExplorerElements, layoutExplorerElements, type ExplorerElements, type ExplorerNodeData } from './explorer-model.js';
import { createExplorerProjection, type ExplorerState } from './explorer-projection.js';
import './styles.css';

const graph = buildProjectGraph(snapshot as AnalysisResult);

function relationLabel(edge: ProjectGraphEdge): string {
  const location = edge.evidence.location;
  return `${edge.moduleSpecifier} at ${location.filePath}:${location.line}:${location.column} (${edge.confidence})`;
}

function App() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const explorationState: ExplorerState = { selectedNodeId, focusedNodeId, expandedNodeIds };
  const projection = useMemo(
    () => createExplorerProjection(graph, explorationState),
    [focusedNodeId, expandedNodeIds],
  );
  const projectedElements = useMemo(() => createExplorerElements(projection), [projection]);
  const [elements, setElements] = useState<ExplorerElements>(projectedElements);

  useEffect(() => {
    let active = true;

    void layoutExplorerElements(projectedElements).then((nextElements) => {
      if (active) {
        setElements(nextElements);
        window.requestAnimationFrame(() => reactFlow?.fitView({ padding: 0.2, duration: 150 }));
      }
    });

    return () => {
      active = false;
    };
  }, [projectedElements, reactFlow]);

  const focusedDependencies = useMemo(
    () => focusedNodeId ? new Set(getDependencies(graph, focusedNodeId).map((edge) => edge.targetNodeId)) : new Set<string>(),
    [focusedNodeId],
  );
  const focusedDependents = useMemo(
    () => focusedNodeId ? new Set(getDependents(graph, focusedNodeId).map((edge) => edge.sourceNodeId)) : new Set<string>(),
    [focusedNodeId],
  );
  const flowNodes: Node<ExplorerNodeData>[] = useMemo(
    () => elements.nodes.map((node) => ({
      ...node,
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
    && hasHiddenDirectContext(selectedNode.id, projection.visibleNodeIds);

  function focusSelectedFile(): void {
    if (selectedNode?.kind !== 'file') {
      return;
    }

    setFocusedNodeId(selectedNode.id);
    setExpandedNodeIds(new Set());
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
  }

  return (
    <main className="explorer-shell">
      <header className="explorer-header">
        <div>
          <p className="eyebrow">BunkerCode</p>
          <h1>Structural Explorer</h1>
        </div>
        <div className="explorer-header-actions">
          <p className="dataset-label">Dataset: packages/analyzer-typescript</p>
          {projection.mode === 'focus' ? <button type="button" onClick={returnToOverview}>Overview</button> : null}
        </div>
      </header>
      <section className="explorer-main" aria-label="Project graph explorer">
        <div className="graph-canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            minZoom={0.25}
            onInit={setReactFlow}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
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
              <p>Select a file to inspect it. Focus keeps a direct context; expansion adds one explicit neighboring context at a time.</p>
            </div>
          )}
        </aside>
      </section>
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

function hasHiddenDirectContext(nodeId: string, visibleNodeIds: ReadonlySet<string>): boolean {
  return [...getDependencies(graph, nodeId), ...getDependents(graph, nodeId)].some((edge) => (
    !visibleNodeIds.has(edge.sourceNodeId) || !visibleNodeIds.has(edge.targetNodeId)
  ));
}

function nodeLabel(node: ProjectGraphNode): string {
  return node.kind === 'file' ? node.path : node.moduleSpecifier;
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
