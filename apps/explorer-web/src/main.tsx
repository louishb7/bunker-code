import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import { getFilesInWorkspacePackage } from '@bunker-code/graph-engine';
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
  createInitialExplorerState,
  expandFileNode,
  focusFileNode,
  openSelectedWorkspacePackage,
  returnToFileOverview as returnToFileOverviewState,
  returnToSystem,
  selectFileNode,
  selectSearchResultFile,
  selectWorkspacePackage,
  type ExplorerState,
} from './explorer-state.js';
import { searchExplorerFiles } from './explorer-search.js';
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
  const [state, setState] = useState<ExplorerState>(() => createInitialExplorerState(structure));
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ExplorerReactFlowInstance | null>(null);
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');
  const orientation = useMemo(
    () => createExplorerOrientation(state, projectLabel, graph, structure),
    [state, projectLabel, graph, structure],
  );
  const fileScope = state.scope === 'system' ? null : state;
  const projection = useMemo(() => createExplorerProjection(source, state), [
    source,
    state.scope,
    state.scope === 'workspace-package' ? state.packageId : null,
    fileScope?.focusedNodeId,
    fileScope?.expandedNodeIds,
  ]);
  const projectedElements = useMemo(() => createExplorerElements(projection), [projection]);
  const [elements, setElements] = useState<ExplorerElements>(projectedElements);
  const searchableFileIds = useMemo(() => fileScope?.scope === 'workspace-package'
    ? new Set(getFilesInWorkspacePackage(structure, fileScope.packageId))
    : undefined, [fileScope, structure]);
  const searchResults = useMemo(
    () => fileScope ? searchExplorerFiles(graph, searchQuery, searchableFileIds) : [],
    [fileScope, graph, searchQuery, searchableFileIds],
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

  const selectedNodeId = fileScope?.selectedNodeId ?? null;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const systemParts = useMemo(() => projection.nodes.filter(
    (node): node is ExplorerWorkspacePackageProjectionNode => node.kind === 'workspace-package',
  ), [projection.nodes]);
  const selectedPart = state.scope === 'system' && state.selectedPackageId
    ? systemParts.find((node) => node.id === state.selectedPackageId)
    : undefined;
  const attention = useMemo(() => createExplorerAttention(projection, state), [projection, state]);
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
    ? createFileExploration(selectedNode, graph, structure, fileScope, projection.visibleNodeIds)
    : undefined, [selectedNode, fileScope, graph, structure, projection.visibleNodeIds]);

  function focusSelectedFile(): void {
    if (!fileExploration?.canFocus || !selectedNode || !fileScope) {
      return;
    }

    setState(focusFileNode(fileScope, selectedNode.id));
    setPendingCenterNodeId(selectedNode.id);
  }

  function expandSelectedNode(): void {
    if (!fileExploration?.canExpand || !selectedNode || !fileScope) {
      return;
    }

    setState(expandFileNode(fileScope, selectedNode.id));
  }

  function returnToFileOverview(): void {
    if (!fileScope) {
      return;
    }

    setState(returnToFileOverviewState(fileScope));
  }

  function returnToSystemOverview(): void {
    if (state.scope !== 'workspace-package') {
      return;
    }

    setState(returnToSystem(state));
    setSearchQuery('');
  }

  function selectSearchResult(nodeId: string): void {
    if (!fileScope) {
      return;
    }

    setState(selectSearchResultFile(fileScope, nodeId, projection.visibleNodeIds.has(nodeId)));
    setPendingCenterNodeId(nodeId);
    setSearchQuery('');
  }

  function openSelectedPackage(): void {
    if (state.scope !== 'system') {
      return;
    }

    const packageState = openSelectedWorkspacePackage(state);

    if (packageState) {
      setState(packageState);
    }
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
            if (state.scope === 'system') {
              setState(selectWorkspacePackage(state, nodeId));
            } else {
              setState(selectFileNode(state, nodeId));
            }
          }}
          onPaneClick={() => {
            if (state.scope === 'system') {
              setState(selectWorkspacePackage(state, null));
            } else {
              setState(selectFileNode(state, null));
            }
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
