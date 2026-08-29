import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import type { ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';
import snapshot from './generated/analyzer-typescript.snapshot.json';
import {
  createExplorerElements,
  layoutExplorerElements,
  type ExplorerElements,
} from './explorer-model.js';
import {
  createExplorerOrientation,
  type ExplorerNavigationTarget,
} from './explorer-orientation.js';
import {
  createExplorerProjection,
  type ExplorerSource,
} from './explorer-projection.js';
import { createExplorerRuntime, type ExplorerRuntimeState } from './explorer-runtime.js';
import {
  createInitialExplorerLocation,
  expandExplorerItem,
  focusExplorerFile,
  navigateToDestination,
  navigateToStructuralPath,
  navigateToTerritory,
  selectExplorerItem,
  type ExplorerLocation,
} from './explorer-state.js';
import { resolveExplorerSearchDestination, searchExplorerFiles } from './explorer-search.js';
import {
  createExplorerTerritoryProjection,
  orderedTerritoryChildren,
} from './explorer-territory-projection.js';
import { createFileExploration } from './file-exploration.js';
import {
  createExplorerAttention,
  explorerAttentionEdgeKey,
} from './explorer-attention.js';
import {
  ExplorerCanvas,
  attentionFlowNode,
  fitViewOptions,
  relationshipFlowEdge,
  type ExplorerReactFlowInstance,
} from './explorer-graph.js';
import {
  ExplorerEmptyDetails,
  ExplorerHeader,
  StatusScreen,
  SystemMapSummary,
} from './explorer-shell.js';
import { FileDetails, TerritoryDetails } from './explorer-details.js';
import './styles.css';

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

  return (
    <Explorer
      graph={runtime.graph}
      structure={runtime.structure}
      projectLabel={runtime.projectLabel}
    />
  );
}

function Explorer({
  graph,
  structure,
  projectLabel,
}: {
  graph: ProjectGraph;
  structure: ProjectStructure;
  projectLabel: string;
}) {
  const territories = useMemo(() => createExplorerTerritoryProjection(
    structure,
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  ), [graph.nodes, structure]);
  const source: ExplorerSource = useMemo(() => ({ graph, structure, territories }), [graph, structure, territories]);
  const [location, setLocation] = useState<ExplorerLocation>(() => createInitialExplorerLocation(territories));
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ExplorerReactFlowInstance | null>(null);
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');
  const orientation = useMemo(
    () => createExplorerOrientation(location, territories, projectLabel, graph),
    [location, territories, projectLabel, graph],
  );
  const projection = useMemo(() => createExplorerProjection(source, location), [
    source,
    location,
  ]);
  const projectedElements = useMemo(() => createExplorerElements(projection), [projection]);
  const [elements, setElements] = useState<ExplorerElements>(projectedElements);
  const searchResults = useMemo(
    () => searchExplorerFiles(graph, searchQuery),
    [graph, searchQuery],
  );

  useEffect(() => {
    let active = true;
    setLayoutState('loading');

    void layoutExplorerElements(projectedElements).then((nextElements) => {
      if (!active) {
        return;
      }

      setElements(nextElements);
      setLayoutState('ready');
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
    if (!reactFlow || layoutState !== 'ready') {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      reactFlow.fitView(fitViewOptions(elements.mode));
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [elements, layoutState, reactFlow]);

  useEffect(() => {
    if (!pendingCenterNodeId || !reactFlow || !elements.nodes.some((node) => node.id === pendingCenterNodeId)) {
      return;
    }

    window.requestAnimationFrame(() => {
      reactFlow.fitView({ nodes: [{ id: pendingCenterNodeId }], padding: 1, duration: 150, maxZoom: 1.2 });
      setPendingCenterNodeId(null);
    });
  }, [elements.nodes, pendingCenterNodeId, reactFlow]);

  const selectedNodeId = location.selectedItemId;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedTerritory = location.selectedItemId
    ? territories.territoriesById.get(location.selectedItemId)
    : undefined;
  const attention = useMemo(() => createExplorerAttention(projection, location), [projection, location]);
  const flowNodes = useMemo(
    () => elements.nodes.map((node) => attentionFlowNode(node, attention.nodes.get(node.id))),
    [elements.nodes, attention.nodes],
  );
  const flowEdges = useMemo(
    () => elements.edges.map((edge) => relationshipFlowEdge(edge, edge.data
      ? attention.edges.get(explorerAttentionEdgeKey(edge.data.kind, edge.source, edge.target))
      : undefined)),
    [elements.edges, attention.edges],
  );
  const currentTerritoryFileIds = useMemo(() => {
    if (location.currentTerritoryId === null) return new Set<string>();

    return new Set(
      orderedTerritoryChildren(territories, location.currentTerritoryId)
        .flatMap((child) => child.kind === 'file' ? [child.fileId] : []),
    );
  }, [location.currentTerritoryId, territories]);
  const fileExploration = useMemo(() => selectedNode && location.currentTerritoryId !== null
    ? createFileExploration(
      selectedNode,
      graph,
      location,
      projection.visibleNodeIds,
      currentTerritoryFileIds,
    )
    : undefined, [selectedNode, graph, structure, location, projection.visibleNodeIds, currentTerritoryFileIds]);

  function focusSelectedFile(): void {
    if (!fileExploration?.canFocus || !selectedNode || location.currentTerritoryId === null) {
      return;
    }

    setLocation(focusExplorerFile(location, selectedNode.id));
    setPendingCenterNodeId(selectedNode.id);
  }

  function expandSelectedNode(): void {
    if (!fileExploration?.canExpand || !selectedNode || location.currentTerritoryId === null) {
      return;
    }

    setLocation(expandExplorerItem(location, selectedNode.id));
  }

  function returnToFileOverview(): void {
    if (location.currentTerritoryId === null) {
      return;
    }

    setLocation({ ...location, focusedFileId: null, expandedItemIds: new Set() });
  }

  function selectSearchResult(nodeId: string): void {
    const result = searchResults.find((candidate) => candidate.nodeId === nodeId);
    if (!result) {
      return;
    }
    const destination = resolveExplorerSearchDestination(result, territories);
    if (!destination) {
      return;
    }
    setLocation(navigateToDestination(location, destination));
    setPendingCenterNodeId(nodeId);
    setSearchQuery('');
  }

  function openSelectedTerritory(): void {
    if (!selectedTerritory) {
      return;
    }
    setLocation(navigateToTerritory(location, selectedTerritory.id, selectedTerritory.structuralPath));
  }

  function fitCurrentGraph(): void {
    reactFlow?.fitView(fitViewOptions(elements.mode));
  }

  function centerSelectedNode(): void {
    if (selectedNode && projection.visibleNodeIds.has(selectedNode.id)) {
      setPendingCenterNodeId(selectedNode.id);
    }
  }

  function navigateTo(target: ExplorerNavigationTarget): void {
    if (target.kind === 'territory') {
      setLocation(navigateToStructuralPath(location, target.destination.structuralPath, target.destination.territoryId));
      setSearchQuery('');
      return;
    }

    returnToFileOverview();
  }

  return (
    <main className="explorer-shell">
      <ExplorerHeader
        orientation={orientation}
        searchQuery={searchQuery}
        searchResults={searchResults}
        showSearch
        showCenterSelected={Boolean(selectedNode && projection.visibleNodeIds.has(selectedNode.id))}
        onNavigate={navigateTo}
        onSearchQueryChange={setSearchQuery}
        onSelectSearchResult={selectSearchResult}
        onFitGraph={fitCurrentGraph}
        onCenterSelected={centerSelectedNode}
      />
      <section className={`explorer-main ${projection.rootSummary ? 'explorer-main-system' : ''}`} aria-label="Project graph explorer">
        {projection.rootSummary ? <SystemMapSummary summary={projection.rootSummary} /> : null}
        <ExplorerCanvas
          nodes={flowNodes}
          edges={flowEdges}
          mode={elements.mode}
          layoutState={layoutState}
          onInit={setReactFlow}
          onNodeClick={(nodeId) => {
            setLocation(selectExplorerItem(location, nodeId));
          }}
          onPaneClick={() => {
            setLocation(selectExplorerItem(location, null));
          }}
        />
        <aside className="details-panel" aria-live="polite">
          {selectedTerritory ? (
            <TerritoryDetails territory={selectedTerritory} onOpen={openSelectedTerritory} />
          ) : fileExploration ? (
            <FileDetails
              exploration={fileExploration}
              onFocus={focusSelectedFile}
              onExpand={expandSelectedNode}
            />
          ) : (
            <ExplorerEmptyDetails orientation={orientation} visibleNodeCount={projection.nodes.length} />
          )}
        </aside>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Explorer root element not found.');
}

createRoot(root).render(<App />);
