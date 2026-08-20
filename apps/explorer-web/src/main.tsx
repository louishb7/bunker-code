import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildProjectGraph, getDependencies, getDependents } from '@bunker-code/graph-engine';
import type { AnalysisResult } from '@bunker-code/contracts';
import type { FileGraphNode } from '@bunker-code/graph-engine';
import snapshot from './generated/analyzer-typescript.snapshot.json';
import {
  createExplorerElements,
  layoutExplorerElements,
  selectedNeighborhood,
  type ExplorerElements,
} from './explorer-model.js';
import './styles.css';

const graph = buildProjectGraph(snapshot as AnalysisResult);
const initialElements = createExplorerElements(graph);

function relationLabel(edge: ReturnType<typeof getDependencies>[number]): string {
  const location = edge.evidence.location;
  return `${edge.moduleSpecifier} at ${location.filePath}:${location.line}:${location.column} (${edge.confidence})`;
}

function App() {
  const [elements, setElements] = useState<ExplorerElements>(initialElements);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void layoutExplorerElements(initialElements).then((nextElements) => {
      if (active) {
        setElements(nextElements);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const neighborhood = useMemo(() => selectedNeighborhood(graph, selectedNodeId), [selectedNodeId]);
  const flowNodes: Node[] = useMemo(
    () => elements.nodes.map((node) => ({
      ...node,
      className: node.id === neighborhood.targetNodeId
        ? 'graph-node graph-node-target'
        : neighborhood.dependencyNodeIds.has(node.id)
          ? 'graph-node graph-node-dependency'
          : neighborhood.dependentNodeIds.has(node.id)
            ? 'graph-node graph-node-dependent'
            : 'graph-node',
    })),
    [elements.nodes, neighborhood],
  );
  const flowEdges: Edge[] = useMemo(
    () => elements.edges.map((edge) => ({
      ...edge,
      className: edge.source === selectedNodeId || edge.target === selectedNodeId ? 'graph-edge-active' : 'graph-edge',
    })),
    [elements.edges, selectedNodeId],
  );
  const selectedNode = graph.nodes.find(
    (node): node is FileGraphNode => node.id === selectedNodeId && node.kind === 'file',
  );
  const dependencies = selectedNodeId ? getDependencies(graph, selectedNodeId) : [];
  const dependents = selectedNodeId ? getDependents(graph, selectedNodeId) : [];

  return (
    <main className="explorer-shell">
      <header className="explorer-header">
        <div>
          <p className="eyebrow">BunkerCode</p>
          <h1>Structural Explorer</h1>
        </div>
        <p className="dataset-label">Dataset: packages/analyzer-typescript</p>
      </header>
      <section className="explorer-main" aria-label="Project graph explorer">
        <div className="graph-canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            minZoom={0.25}
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
              <p className="eyebrow">Selected file</p>
              <h2>{selectedNode.path}</h2>
              <dl>
                <div><dt>ID</dt><dd>{selectedNode.id}</dd></div>
                <div><dt>Dependencies</dt><dd>{dependencies.length}</dd></div>
                <div><dt>Dependents</dt><dd>{dependents.length}</dd></div>
              </dl>
              <RelationList title="Dependencies" edges={dependencies} />
              <RelationList title="Dependents" edges={dependents} />
            </>
          ) : (
            <div className="empty-details">
              <p className="eyebrow">Overview</p>
              <h2>{elements.nodes.length} files</h2>
              <p>Select a file to inspect its direct structural relationships and source evidence.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function RelationList({ title, edges }: { title: string; edges: ReturnType<typeof getDependencies> }) {
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
