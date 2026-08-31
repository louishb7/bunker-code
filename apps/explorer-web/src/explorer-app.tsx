import { useEffect, useMemo, useState } from 'react';
import type { ResponsibilityAnalysisResult, ResponsibilityFinding } from '@bunker-code/contracts';
import type { ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';
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
import {
  expandExplorerItem,
  createInitialExplorerLocation,
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
import { ExplorerHeader } from './explorer-shell.js';
import { FileDetails, TerritoryDetails } from './explorer-details.js';
import { ExplorerSurfaceControl } from './explorer-surface-control.js';
import { ResponsibilityDetails } from './explorer-responsibility-details.js';
import { ResponsibilityMap } from './explorer-responsibility-map.js';
import {
  createExplorerResponsibilityProjection,
  isResponsibilityPerspectiveEligible,
} from './explorer-responsibility-projection.js';
import { ExplorerSystemOverview } from './explorer-system-overview.js';
import { createExplorerSystemOrientationProjection } from './explorer-system-orientation.js';
import { createExplorerComprehensionProjection } from './explorer-comprehension-projection.js';
import { ExplorerL0Experiment } from './explorer-l0-experiment.js';
import {
  createExplorerL0ExperimentModel,
  type ExplorerL0ExperimentVariant,
} from './explorer-l0-experiment-model.js';
import { createExplorerStructuralEvidenceDistribution } from './explorer-structural-evidence-distribution.js';
import {
  createSpatialTerritoryMapModel,
  SpatialTerritoryMap,
} from './explorer-spatial-territory-map.js';
import {
  clearExplorerResponsibilitySelection,
  createInitialExplorerViewState,
  locateResponsibilityFinding,
  selectExplorerResponsibility,
  selectExplorerResponsibilityFinding,
  switchExplorerSurface,
} from './explorer-view-state.js';

export function Explorer({
  graph,
  structure,
  responsibilities,
  projectLabel,
  experimentalL0Variant,
}: {
  graph: ProjectGraph;
  structure: ProjectStructure;
  responsibilities: ResponsibilityAnalysisResult;
  projectLabel: string;
  experimentalL0Variant?: ExplorerL0ExperimentVariant;
}) {
  const territories = useMemo(() => createExplorerTerritoryProjection(
    structure,
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  ), [graph.nodes, structure]);
  const responsibilityProjection = useMemo(
    () => createExplorerResponsibilityProjection(responsibilities, territories),
    [responsibilities, territories],
  );
  const source: ExplorerSource = useMemo(() => ({ graph, structure, territories }), [graph, structure, territories]);
  const [viewState, setViewState] = useState(() => createInitialExplorerViewState(territories));
  const { location, surface, selectedResponsibility, selectedFindingId } = viewState;
  const responsibilityAvailable = isResponsibilityPerspectiveEligible(responsibilities);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ExplorerReactFlowInstance | null>(null);
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');
  const orientation = useMemo(
    () => createExplorerOrientation(location, territories, projectLabel, graph),
    [location, territories, projectLabel, graph],
  );
  const projection = useMemo(() => createExplorerProjection(source, location), [source, location]);
  const systemOrientation = useMemo(
    () => createExplorerSystemOrientationProjection(graph, structure),
    [graph, structure],
  );
  const comprehension = useMemo(
    () => createExplorerComprehensionProjection(territories, systemOrientation, responsibilityProjection),
    [territories, systemOrientation, responsibilityProjection],
  );
  const l0ExperimentModel = useMemo(() => {
    if (!experimentalL0Variant) return null;
    const distribution = createExplorerStructuralEvidenceDistribution(territories, responsibilityProjection);
    return createExplorerL0ExperimentModel(comprehension, distribution, territories, responsibilityProjection);
  }, [comprehension, experimentalL0Variant, responsibilityProjection, territories]);
  const projectedElements = useMemo(
    () => projection.mode === 'focus' ? createExplorerElements(projection) : null,
    [projection],
  );
  const [elements, setElements] = useState<ExplorerElements | null>(projectedElements);
  const searchResults = useMemo(() => searchExplorerFiles(graph, searchQuery), [graph, searchQuery]);

  useEffect(() => {
    if (!projectedElements) {
      setElements(null);
      setLayoutState('ready');
      return;
    }

    let active = true;
    setLayoutState('loading');

    void layoutExplorerElements(projectedElements).then((nextElements) => {
      if (!active) return;
      setElements(nextElements);
      setLayoutState('ready');
    }).catch(() => {
      if (active) setLayoutState('error');
    });

    return () => { active = false; };
  }, [projectedElements, reactFlow]);

  useEffect(() => {
    if (!elements || !reactFlow || layoutState !== 'ready' || surface !== 'territory') return;
    const animationFrame = window.requestAnimationFrame(() => reactFlow.fitView(fitViewOptions(elements.mode)));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [elements, layoutState, surface, reactFlow]);

  useEffect(() => {
    if (!pendingCenterNodeId || !reactFlow || !elements || surface !== 'territory' || !elements.nodes.some((node) => node.id === pendingCenterNodeId)) return;
    window.requestAnimationFrame(() => {
      reactFlow.fitView({ nodes: [{ id: pendingCenterNodeId }], padding: 1, duration: 150, maxZoom: 1.2 });
      setPendingCenterNodeId(null);
    });
  }, [elements, pendingCenterNodeId, surface, reactFlow]);

  const selectedNodeId = location.selectedItemId;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedTerritory = location.selectedItemId ? territories.territoriesById.get(location.selectedItemId) : undefined;
  const attention = useMemo(() => createExplorerAttention(projection, location), [projection, location]);
  const flowNodes = useMemo(
    () => elements?.nodes.map((node) => attentionFlowNode(node, attention.nodes.get(node.id))) ?? [],
    [elements, attention.nodes],
  );
  const flowEdges = useMemo(
    () => elements?.edges.map((edge) => relationshipFlowEdge(edge, edge.data
      ? attention.edges.get(explorerAttentionEdgeKey(edge.data.kind, edge.source, edge.target))
      : undefined)) ?? [],
    [elements, attention.edges],
  );
  const currentTerritoryFileIds = useMemo(() => {
    return new Set(orderedTerritoryChildren(territories, location.currentTerritoryId)
      .flatMap((child) => child.kind === 'file' ? [child.fileId] : []));
  }, [location.currentTerritoryId, territories]);
  const fileExploration = useMemo(() => selectedNode
    ? createFileExploration(selectedNode, graph, location, projection.visibleNodeIds, currentTerritoryFileIds)
    : undefined, [selectedNode, graph, structure, location, projection.visibleNodeIds, currentTerritoryFileIds]);

  function setLocation(nextLocation: ExplorerLocation): void {
    setViewState((current) => ({ ...current, location: nextLocation }));
  }

  function focusSelectedFile(): void {
    if (!fileExploration?.canFocus || !selectedNode) return;
    setLocation(focusExplorerFile(location, selectedNode.id));
    setPendingCenterNodeId(selectedNode.id);
  }

  function expandSelectedNode(): void {
    if (!fileExploration?.canExpand || !selectedNode) return;
    setLocation(expandExplorerItem(location, selectedNode.id));
  }

  function selectSearchResult(nodeId: string): void {
    const result = searchResults.find((candidate) => candidate.nodeId === nodeId);
    if (!result) return;
    const destination = resolveExplorerSearchDestination(result, territories);
    if (!destination) return;
    setLocation(navigateToDestination(location, destination));
    setPendingCenterNodeId(nodeId);
    setSearchQuery('');
  }

  function openSelectedTerritory(): void {
    if (!selectedTerritory) return;
    setLocation(navigateToTerritory(location, selectedTerritory.id, selectedTerritory.structuralPath));
  }

  function openTerritory(territoryId: string): void {
    const territory = territories.territoriesById.get(territoryId);
    if (!territory) throw new Error(`Territory not found: ${territoryId}`);
    setLocation(navigateToTerritory(location, territory.id, territory.structuralPath));
  }

  function navigateTo(target: ExplorerNavigationTarget): void {
    if (target.kind === 'territory') {
      setViewState((current) => ({
        ...current,
        surface: 'territory',
        location: navigateToStructuralPath(current.location, target.destination.structuralPath, target.destination.territoryId),
      }));
      setSearchQuery('');
      return;
    }
    setViewState((current) => ({
      ...current,
      surface: 'territory',
      location: { ...current.location, focusedFileId: null, expandedItemIds: new Set() },
    }));
  }

  function locateFinding(finding: ResponsibilityFinding): void {
    setViewState((current) => locateResponsibilityFinding(current, finding, territories));
    setPendingCenterNodeId(finding.subject.fileId);
  }

  const surfaceControl = (
    <ExplorerSurfaceControl
      surface={surface}
      responsibilityAvailable={responsibilityAvailable}
      onChange={(nextSurface) => setViewState((current) => switchExplorerSurface(current, nextSurface))}
    />
  );
  const currentTerritory = location.currentTerritoryId === null
    ? territories.system
    : territories.territoriesById.get(location.currentTerritoryId);
  if (!currentTerritory) throw new Error(`Territory not found: ${location.currentTerritoryId}`);
  const spatialMapModel = projection.mode === 'focus'
    ? null
    : createSpatialTerritoryMapModel(projection, currentTerritory);
  const showTerritoryInspector = surface === 'territory' && Boolean(selectedTerritory || fileExploration);
  const showResponsibilityInspector = surface === 'responsibility' && selectedResponsibility !== null;

  return (
    <main className="explorer-shell">
      <ExplorerHeader
        orientation={orientation}
        searchQuery={searchQuery}
        searchResults={searchResults}
        showSearch={surface === 'territory'}
        showGraphTools={surface === 'territory' && projection.mode === 'focus'}
        showCenterSelected={Boolean(selectedNode && projection.visibleNodeIds.has(selectedNode.id))}
        surfaceControl={surfaceControl}
        onNavigate={navigateTo}
        onSearchQueryChange={setSearchQuery}
        onSelectSearchResult={selectSearchResult}
        onFitGraph={() => elements && reactFlow?.fitView(fitViewOptions(elements.mode))}
        onCenterSelected={() => {
          if (selectedNode && projection.visibleNodeIds.has(selectedNode.id)) setPendingCenterNodeId(selectedNode.id);
        }}
      />
      <section
        className={`explorer-main explorer-main-${surface} ${(showResponsibilityInspector || showTerritoryInspector) ? 'explorer-main-has-inspector' : ''}`}
        aria-label={surface === 'overview' ? 'System overview' : surface === 'responsibility' ? 'Responsibility explorer' : 'Territory explorer'}
      >
        {surface === 'overview' && experimentalL0Variant && l0ExperimentModel ? (
          <ExplorerL0Experiment
            projectLabel={projectLabel}
            variant={experimentalL0Variant}
            model={l0ExperimentModel}
          />
        ) : surface === 'overview' ? (
          <ExplorerSystemOverview
            projectLabel={projectLabel}
            comprehension={comprehension}
            responsibilityAvailable={responsibilityAvailable}
            onExploreResponsibilities={() => setViewState((current) => switchExplorerSurface(current, 'responsibility'))}
            onExploreStructure={() => setViewState((current) => switchExplorerSurface(current, 'territory'))}
          />
        ) : surface === 'territory' ? (
          projection.mode === 'focus' && elements ? (
            <ExplorerCanvas
              nodes={flowNodes}
              edges={flowEdges}
              mode={elements.mode}
              layoutState={layoutState}
              onInit={setReactFlow}
              onNodeClick={(nodeId) => setLocation(selectExplorerItem(location, nodeId))}
              onPaneClick={() => setLocation(selectExplorerItem(location, null))}
            />
          ) : spatialMapModel ? (
            <SpatialTerritoryMap
              model={spatialMapModel}
              selectedItemId={location.selectedItemId}
              onSelectItem={(itemId) => setLocation(selectExplorerItem(location, itemId))}
              onOpenTerritory={(territory) => openTerritory(territory.id)}
            />
          ) : null
        ) : (
          <ResponsibilityMap
            projection={responsibilityProjection}
            selectedResponsibility={selectedResponsibility}
            selectedFindingId={selectedFindingId}
            onSelectResponsibility={(responsibility) => setViewState((current) => selectExplorerResponsibility(current, responsibility))}
            onSelectFinding={(responsibility, findingId) => setViewState((current) => selectExplorerResponsibilityFinding(current, responsibility, findingId))}
          />
        )}
        {showResponsibilityInspector || showTerritoryInspector ? <aside className="details-panel" aria-live="polite">
          {surface === 'territory' ? (
            <button
              type="button"
              className="inspector-close"
              onClick={() => setLocation(selectExplorerItem(location, null))}
            >
              Close inspector
            </button>
          ) : (
            <button
              type="button"
              className="inspector-close"
              onClick={() => setViewState((current) => clearExplorerResponsibilitySelection(current))}
            >
              Close inspector
            </button>
          )}
          {surface === 'responsibility' ? (
            <ResponsibilityDetails
              projection={responsibilityProjection}
              territories={territories}
              selectedResponsibility={selectedResponsibility}
              selectedFindingId={selectedFindingId}
              onSelectFinding={(responsibility, findingId) => setViewState((current) => selectExplorerResponsibilityFinding(current, responsibility, findingId))}
              onBackToResponsibility={() => selectedResponsibility && setViewState((current) => selectExplorerResponsibility(current, selectedResponsibility))}
              onLocateFinding={locateFinding}
            />
          ) : selectedTerritory ? (
            <TerritoryDetails territory={selectedTerritory} onOpen={openSelectedTerritory} />
          ) : fileExploration ? (
            <FileDetails exploration={fileExploration} onFocus={focusSelectedFile} onExpand={expandSelectedNode} />
          ) : null}
        </aside> : null}
      </section>
    </main>
  );
}
