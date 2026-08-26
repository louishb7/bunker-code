import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import type { PackageDependency, ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';
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
  type ExplorerWorkspacePackageProjectionNode,
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
import { createExplorerTerritoryProjection } from './explorer-territory-projection.js';
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
import { FileDetails, WorkspacePackageDetails } from './explorer-details.js';
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
      packageDependencies={runtime.packageDependencies}
      projectLabel={runtime.projectLabel}
    />
  );
}

function Explorer({
  graph,
  structure,
  packageDependencies,
  projectLabel,
}: {
  graph: ProjectGraph;
  structure: ProjectStructure;
  packageDependencies: PackageDependency[];
  projectLabel: string;
}) {
  const source: ExplorerSource = useMemo(
    () => ({ graph, structure, packageDependencies }),
    [graph, structure, packageDependencies],
  );
  const territories = useMemo(() => createExplorerTerritoryProjection(
    structure,
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  ), [graph.nodes, structure]);
  const [location, setLocation] = useState<ExplorerLocation>(() => createInitialExplorerLocation(territories));
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ExplorerReactFlowInstance | null>(null);
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');
  const orientation = useMemo(
    () => createExplorerOrientation(location, territories, projectLabel, graph),
    [location, territories, projectLabel, graph],
  );
  const fileScope = location.currentTerritoryId === null ? null : location;
  const projection = useMemo(() => createExplorerProjection(source, location), [
    source,
    location,
  ]);
  const projectedElements = useMemo(() => createExplorerElements(projection), [projection]);
  const [elements, setElements] = useState<ExplorerElements>(projectedElements);
  const searchResults = useMemo(
    () => fileScope ? searchExplorerFiles(graph, searchQuery) : [],
    [fileScope, graph, searchQuery],
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
  const systemParts = useMemo(() => projection.nodes.filter(
    (node): node is ExplorerWorkspacePackageProjectionNode => node.kind === 'workspace-package',
  ), [projection.nodes]);
  const selectedPart = location.currentTerritoryId === null && location.selectedItemId
    ? systemParts.find((node) => node.id === location.selectedItemId)
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
  const fileExploration = useMemo(() => selectedNode && fileScope
    ? createFileExploration(selectedNode, graph, structure, location, projection.visibleNodeIds)
    : undefined, [selectedNode, fileScope, graph, structure, location, projection.visibleNodeIds]);

  function focusSelectedFile(): void {
    if (!fileExploration?.canFocus || !selectedNode || !fileScope) {
      return;
    }

    setLocation(focusExplorerFile(location, selectedNode.id));
    setPendingCenterNodeId(selectedNode.id);
  }

  function expandSelectedNode(): void {
    if (!fileExploration?.canExpand || !selectedNode || !fileScope) {
      return;
    }

    setLocation(expandExplorerItem(location, selectedNode.id));
  }

  function returnToFileOverview(): void {
    if (!fileScope) {
      return;
    }

    setLocation({ ...location, focusedFileId: null, expandedItemIds: new Set() });
  }

  function returnToSystemOverview(): void {
    setLocation(navigateToStructuralPath(location, territories.system.structuralPath, null));
    setSearchQuery('');
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

  function openSelectedPackage(): void {
    const territory = location.selectedItemId ? territories.territoriesById.get(location.selectedItemId) : undefined;
    if (!territory) {
      return;
    }
    setLocation(navigateToTerritory(location, territory.id, territory.structuralPath));
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
    if (target === 'system') {
      returnToSystemOverview();
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
        showSearch={fileScope !== null}
        showCenterSelected={Boolean(selectedNode && projection.visibleNodeIds.has(selectedNode.id))}
        onNavigate={navigateTo}
        onSearchQueryChange={setSearchQuery}
        onSelectSearchResult={selectSearchResult}
        onFitGraph={fitCurrentGraph}
        onCenterSelected={centerSelectedNode}
      />
      <section className={`explorer-main ${projection.systemSummary ? 'explorer-main-system' : ''}`} aria-label="Project graph explorer">
        {projection.systemSummary ? <SystemMapSummary summary={projection.systemSummary} /> : null}
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
          {selectedPart ? (
            <WorkspacePackageDetails
              part={selectedPart}
              systemParts={systemParts}
              packageDependencies={packageDependencies}
              onOpen={openSelectedPackage}
            />
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
