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
import { getFilesInWorkspacePackage } from '@bunker-code/graph-engine';
import type { PackageDependency, ProjectGraph, ProjectGraphEdge, ProjectStructure } from '@bunker-code/graph-engine';
import type { WorkspacePackage } from '@bunker-code/contracts';
import snapshot from './generated/analyzer-typescript.snapshot.json';
import {
  createExplorerElements,
  layoutExplorerElements,
  type ExplorerElements,
  type ExplorerEdge,
  type ExplorerNode,
  type ExplorerNodeData,
} from './explorer-model.js';
import {
  createExplorerOrientation,
  type ExplorerNavigationTarget,
  type ExplorerOrientation,
} from './explorer-orientation.js';
import {
  createExplorerProjection,
  type ExplorerSource,
  type ExplorerSystemSummary,
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
import {
  describeRelationship,
  relationshipDirectionHelp,
  relationshipDirectionKey,
} from './relationship-language.js';
import {
  createPackageExploration,
  type PackageExplorationRelation,
} from './package-exploration.js';
import {
  createFileExploration,
  type FileExploration,
  type FileExplorationRelation,
} from './file-exploration.js';
import { systemMapVocabularyPlacement } from './explorer-vocabulary.js';
import { VocabularyHelp } from './vocabulary-help.js';
import {
  createExplorerAttention,
  explorerAttentionEdgeKey,
  type ExplorerEdgeAttention,
  type ExplorerNodeAttention,
} from './explorer-attention.js';
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
  const source: ExplorerSource = useMemo(() => ({ graph, structure, packageDependencies }), [graph, structure, packageDependencies]);
  const [state, setState] = useState<ExplorerState>(() => createInitialExplorerState(structure));
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
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
      window.requestAnimationFrame(() => reactFlow?.fitView(fitViewOptions(projectedElements.mode)));
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

  const selectedNodeId = fileScope?.selectedNodeId ?? null;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const systemParts = useMemo(() => projection.nodes.filter(
    (node): node is ExplorerWorkspacePackageProjectionNode => node.kind === 'workspace-package',
  ), [projection.nodes]);
  const selectedPart = state.scope === 'system' && state.selectedPackageId
    ? systemParts.find((node) => node.id === state.selectedPackageId)
    : undefined;
  const attention = useMemo(() => createExplorerAttention(projection, state), [projection, state]);
  const flowNodes: Node<ExplorerNodeData>[] = useMemo(
    () => elements.nodes.map((node) => attentionFlowNode(node, attention.nodes.get(node.id))),
    [elements.nodes, attention.nodes],
  );
  const flowEdges: Edge[] = useMemo(
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
      <header className="explorer-header">
        <OrientationHeader orientation={orientation} onNavigate={navigateTo} />
        <div className="explorer-header-actions">
          {fileScope ? (
            <label className="search-control">
              <span>Find file</span>
              <input
                aria-label="Find file"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Path or file name"
              />
              {searchQuery.trim() ? <SearchResults results={searchResults} onSelect={selectSearchResult} /> : null}
            </label>
          ) : null}
          <button type="button" onClick={fitCurrentGraph}>Fit graph</button>
          {selectedNode && projection.visibleNodeIds.has(selectedNode.id) ? (
            <button type="button" onClick={centerSelectedNode}>Center selected</button>
          ) : null}
        </div>
      </header>
      <section className={`explorer-main ${projection.systemSummary ? 'explorer-main-system' : ''}`} aria-label="Project graph explorer">
        {projection.systemSummary ? <SystemMapSummary summary={projection.systemSummary} /> : null}
        <div className="graph-canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={fitViewOptions(elements.mode)}
            minZoom={0.35}
            onInit={setReactFlow}
            onNodeClick={(_, node) => {
              if (state.scope === 'system') {
                setState(selectWorkspacePackage(state, node.id));
              } else {
                setState(selectFileNode(state, node.id));
              }
            }}
            onPaneClick={() => {
              if (state.scope === 'system') {
                setState(selectWorkspacePackage(state, null));
              } else {
                setState(selectFileNode(state, null));
              }
            }}
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
            <div className="empty-details">
              <p className="eyebrow">{orientation.scaleLabel}</p>
              <h2>{orientation.focusedFileLabel
                ? `Direct connections for ${orientation.focusedFileLabel}`
                : orientation.scale === 'system-map'
                  ? 'Select a part to understand it'
                  : `${projection.nodes.length} visible nodes`}</h2>
              <p>{orientation.scale === 'system-map'
                ? 'Each part shows its analyzed files and detected connections. Selection keeps you on this map; Open files takes you deeper.'
                : orientation.scale === 'file-connections'
                  ? 'Select any visible item to inspect it. Use Back to return to the files in this part.'
                  : 'Find a file, select it, then show its direct structural connections.'}</p>
              {orientation.scale === 'file-connections' ? (
                <VocabularyHelp placement="file-connections" label="Learn about this view" />
              ) : null}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function SystemMapSummary({ summary }: { summary: ExplorerSystemSummary }) {
  const vocabularyPlacement = systemMapVocabularyPlacement(summary.detectedPartCount > 0);

  return (
    <section className="system-map-summary" aria-labelledby="system-map-summary-title">
      <div className="system-summary-introduction">
        <p className="eyebrow">System at a glance</p>
        <h2 id="system-map-summary-title">
          <span data-system-part-count={summary.detectedPartCount}>{countLabel(summary.detectedPartCount, 'detected part')}</span>
          <span aria-hidden="true"> · </span>
          <span data-analyzed-file-count={summary.analyzedFileCount}>{countLabel(summary.analyzedFileCount, 'analyzed file')}</span>
        </h2>
        <p>Select a part to understand how it connects. Open its files to explore deeper.</p>
        {vocabularyPlacement ? <VocabularyHelp placement={vocabularyPlacement} label="Learn about detected parts" /> : null}
      </div>
      <div className="relationship-key" aria-label={`Relationship direction: ${relationshipDirectionKey}. ${relationshipDirectionHelp}`}>
        <strong>Relationship direction</strong>
        <p><span aria-hidden="true">A → B</span><span>means A uses B</span></p>
        <small>{relationshipDirectionHelp}</small>
        <VocabularyHelp placement="relationship-direction" label="Learn Uses and Used by" />
      </div>
      <div className="filesystem-overview" aria-label="Folder organization">
        <div>
          <strong>Folder organization</strong>
          <span>Where these parts live; not an architectural classification.</span>
        </div>
        <ul>
          {summary.filesystemGroups.map((group) => (
            <li key={group.id} data-filesystem-group={group.id}>
              <strong>{group.label}</strong>
              <span>{group.partLabels.join(' · ')}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function OrientationHeader({
  orientation,
  onNavigate,
}: {
  orientation: ExplorerOrientation;
  onNavigate(target: ExplorerNavigationTarget): void;
}) {
  const backAction = orientation.backAction;

  return (
    <div className="explorer-orientation">
      <p className="eyebrow">BunkerCode</p>
      <div className="orientation-heading">
        <h1>{orientation.projectLabel}</h1>
        <p
          className="scale-indicator"
          aria-label={`Current view: ${orientation.scaleLabel}`}
          data-explorer-scale={orientation.scale}
        >
          <span>Current view</span>
          <strong>{orientation.scaleLabel}</strong>
        </p>
      </div>
      {backAction ? (
        <button
          type="button"
          className="back-action"
          aria-label={backAction.label}
          onClick={() => onNavigate(backAction.target)}
        >
          <span aria-hidden="true">←</span>
          {backAction.label}
        </button>
      ) : null}
      <nav className="breadcrumb" aria-label="Explorer location">
        <ol>
          {orientation.trail.map((item, index) => (
            <li key={item.id}>
              {index > 0 ? <span className="breadcrumb-separator" aria-hidden="true">/</span> : null}
              {item.target ? (
                <button type="button" onClick={() => {
                  if (item.target) onNavigate(item.target);
                }}>{item.label}</button>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

function ExplorerNodeView({ data }: NodeProps<ExplorerNode>) {
  if (data.kind === 'workspace-package') {
    const fileCount = data.fileCount ?? 0;
    const usesCount = data.usesCount ?? 0;
    const usedByCount = data.usedByCount ?? 0;

    return (
      <>
        <Handle type="target" position={Position.Top} />
        <strong className="graph-node-label part-node-name" title={data.technicalLabel ?? data.label}>{data.label}</strong>
        <span className="part-node-type">Part of this system</span>
        <div className="part-node-facts">
          <span className="part-file-count">{countLabel(fileCount, 'analyzed file')}</span>
          <span className="part-relationship-summary">
            {usesCount === 0 && usedByCount === 0
              ? 'No detected connections'
              : `Uses ${usesCount} · Used by ${usedByCount}`}
          </span>
        </div>
        {data.attentionLabel ? (
          <span className="graph-node-cues"><span className="graph-node-attention">{data.attentionLabel}</span></span>
        ) : null}
        <Handle type="source" position={Position.Bottom} />
      </>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <strong className="graph-node-label" title={data.label}>{data.label}</strong>
      {data.kind === 'external' || data.scopeRole === 'contextual' ? (
        <span className="graph-node-subtitle" title={data.subtitle}>{data.subtitle}</span>
      ) : null}
      {data.contextLabel || data.attentionLabel ? (
        <span className="graph-node-cues">
          {data.contextLabel ? <span className="graph-node-context">{data.contextLabel}</span> : null}
          {data.attentionLabel ? <span className="graph-node-attention">{data.attentionLabel}</span> : null}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function WorkspacePackageDetails({
  part,
  systemParts,
  packageDependencies,
  onOpen,
}: {
  part: ExplorerWorkspacePackageProjectionNode;
  systemParts: ExplorerWorkspacePackageProjectionNode[];
  packageDependencies: PackageDependency[];
  onOpen(): void;
}) {
  const exploration = createPackageExploration(part, systemParts, packageDependencies);

  return (
    <article className="part-exploration" aria-labelledby="selected-part-title">
      <header className="part-identity">
        <p className="eyebrow">Part of this system</p>
        <h2 id="selected-part-title">{exploration.presentationLabel}</h2>
        <p className="part-file-summary">{countLabel(exploration.fileCount, 'analyzed file')}</p>
        {exploration.zeroFileExplanation ? <p className="part-state-explanation">{exploration.zeroFileExplanation}</p> : null}
        <VocabularyHelp placement="workspace-package" label="Learn about this part" />
      </header>

      <section className="part-location" aria-labelledby="part-location-title">
        <h3 id="part-location-title">Located in</h3>
        <p>{exploration.location}</p>
      </section>

      <div className="part-relationships" aria-label="Connections to other parts">
        {exploration.isolatedExplanation ? (
          <section aria-labelledby="part-connections-title">
            <h3 id="part-connections-title">Connections</h3>
            <p className="part-state-explanation">{exploration.isolatedExplanation}</p>
          </section>
        ) : (
          <>
            <VocabularyHelp placement="relationship-direction" label="Learn Uses and Used by" />
            <PackageRelationList
              title="Uses"
              emptyMessage="No detected connections from this part to other parts."
              relations={exploration.uses}
            />
            <PackageRelationList
              title="Used by"
              emptyMessage="No other detected parts use this part."
              relations={exploration.usedBy}
            />
          </>
        )}
      </div>

      <section className="part-next-action" aria-labelledby="part-next-action-title">
        <h3 id="part-next-action-title">Explore this part</h3>
        {exploration.canOpenFiles ? (
          <>
            <div className="details-actions"><button className="primary-action" type="button" onClick={onOpen}>Open files</button></div>
            <p>See the analyzed files that make up this part.</p>
          </>
        ) : (
          <p className="part-state-explanation">There are no analyzed files to open for this part.</p>
        )}
      </section>

      <details className="part-disclosure" data-disclosure="technical-details">
        <summary>Technical details</summary>
        <dl>
          <div><dt>Workspace package</dt><dd>{exploration.technicalIdentity}</dd></div>
          <div><dt>Root path</dt><dd>{exploration.location}</dd></div>
          <div><dt>Filesystem group</dt><dd>{exploration.filesystemGroup === '.' ? './' : `${exploration.filesystemGroup}/`}</dd></div>
        </dl>
      </details>

      <details className="part-disclosure" data-disclosure="evidence">
        <summary>How BunkerCode knows</summary>
        <PackageEvidence
          rootPath={exploration.location}
          evidence={exploration.evidence}
          relationships={[...exploration.uses, ...exploration.usedBy]}
        />
      </details>
    </article>
  );
}

function FileDetails({
  exploration,
  onFocus,
  onExpand,
}: {
  exploration: FileExploration;
  onFocus(): void;
  onExpand(): void;
}) {
  return (
    <article className={`file-exploration file-exploration-${exploration.kind}`} aria-labelledby="selected-file-title">
      <header className="file-identity">
        <p className="eyebrow">{exploration.anchor?.isSelected ? 'Connection anchor' : 'Selected item'}</p>
        <h2 id="selected-file-title">{exploration.presentationLabel}</h2>
      </header>

      <section className="file-context" aria-labelledby="file-context-title">
        <h3 id="file-context-title">{exploration.contextLabel}</h3>
        {exploration.kind === 'external-module' ? <p className="file-secondary-type">External module</p> : null}
        {exploration.ownerPartLabel ? <p className="file-owner-part">{exploration.ownerPartLabel}</p> : null}
        {exploration.contextExplanation ? <p>{exploration.contextExplanation}</p> : null}
        {exploration.kind === 'external-module' ? (
          <VocabularyHelp placement="external-module" label="Why is this here?" />
        ) : exploration.kind === 'contextual-file' ? (
          <VocabularyHelp placement="contextual-file" label="Why is this here?" />
        ) : null}
        {exploration.location ? (
          <div className="file-location">
            <strong>Located in</strong>
            <span>{exploration.location}</span>
          </div>
        ) : null}
      </section>

      {exploration.anchor ? (
        <section className="file-anchor-context" aria-label={`Connection anchor: ${exploration.anchor.label}`}>
          {!exploration.anchor.isSelected ? (
            <>
              <strong>Connection anchor</strong>
              <span>{exploration.anchor.label}</span>
            </>
          ) : null}
          <p>{exploration.anchor.isSelected
            ? 'The map is arranged around this file and its direct connections.'
            : 'This remains the file around which the map is arranged. The selected item is being inspected without changing the anchor.'}</p>
          <VocabularyHelp placement="file-connections" label="Learn about this view" />
        </section>
      ) : null}

      <div className="file-relationships" aria-label="File connections">
        <VocabularyHelp placement="relationship-direction" label="Learn Uses and Used by" />
        <FileRelationList title="Uses" emptyMessage={exploration.usesEmptyMessage} relations={exploration.uses} />
        <FileRelationList title="Used by" emptyMessage={exploration.usedByEmptyMessage} relations={exploration.usedBy} />
      </div>

      <section className="file-next-action" aria-labelledby="file-next-action-title">
        <h3 id="file-next-action-title">Investigate this item</h3>
        {exploration.canFocus ? (
          <div className="file-action-option">
            <button className="primary-action" type="button" onClick={onFocus}>Show direct connections</button>
            <p>Reorganize the map around this file, what it uses, and what uses it.</p>
          </div>
        ) : null}
        {exploration.canExpand ? (
          <div className="file-action-option file-action-secondary">
            <button type="button" onClick={onExpand}>Show one more step</button>
            <p>Reveal one additional direct neighborhood without changing the connection anchor.</p>
          </div>
        ) : null}
        {exploration.actionUnavailableExplanation ? (
          <p className="part-state-explanation">{exploration.actionUnavailableExplanation}</p>
        ) : null}
      </section>

      <details className="part-disclosure file-disclosure" data-disclosure="file-technical-details">
        <summary>Technical details</summary>
        <dl>
          <div><dt>Full ID</dt><dd>{exploration.technicalIdentity}</dd></div>
          <div><dt>Kind</dt><dd>{exploration.technicalKind}</dd></div>
          <div><dt>Uses occurrences</dt><dd>{exploration.rawUsesCount}</dd></div>
          <div><dt>Used by occurrences</dt><dd>{exploration.rawUsedByCount}</dd></div>
        </dl>
      </details>

      <details className="part-disclosure file-disclosure" data-disclosure="file-evidence">
        <summary>How BunkerCode knows</summary>
        <FileEvidence exploration={exploration} />
      </details>
    </article>
  );
}

function PackageEvidence({
  rootPath,
  evidence,
  relationships,
}: {
  rootPath: string;
  evidence: WorkspacePackage['evidence'];
  relationships: PackageExplorationRelation[];
}) {
  return (
    <div className="package-evidence">
      <VocabularyHelp placement="evidence" label="Learn about this evidence" />
      <section aria-labelledby="detection-evidence-title">
        <h3 id="detection-evidence-title">Detection evidence</h3>
        <p><strong>Detected root:</strong> {rootPath}</p>
        <ul>
          {evidence.map((item) => <li key={evidenceLabel(item)}>{evidenceLabel(item)}</li>)}
        </ul>
      </section>
      <section aria-labelledby="relationship-evidence-title">
        <h3 id="relationship-evidence-title">Relationship evidence</h3>
        {relationships.length === 0 ? <p className="muted">No package relationships were detected for this part.</p> : (
          <ul className="relationship-proof-list">
            {relationships.map((relationship) => (
              <li key={relationship.id}>
                <strong>{describeRelationship(relationship.sourceLabel, relationship.targetLabel)}</strong>
                <span>{countLabel(relationship.fileDependencies.length, 'supporting file relationship')}</span>
                <ul>
                  {relationship.fileDependencies.map((edge) => (
                    <li key={edge.id}>
                      <span>{describeRelationship(edge.sourceNodeId, edge.targetNodeId)}</span>
                      <span>{relationLabel(edge)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PackageRelationList({
  title,
  emptyMessage,
  relations,
}: {
  title: string;
  emptyMessage: string;
  relations: PackageExplorationRelation[];
}) {
  const headingId = `part-${title.toLowerCase().replaceAll(' ', '-')}-title`;

  return (
    <section className="relation-list" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {relations.length === 0 ? <p className="part-state-explanation">{emptyMessage}</p> : (
        <ul>
          {relations.map((relation) => (
            <li key={relation.id} aria-label={describeRelationship(relation.sourceLabel, relation.targetLabel)}>
              <strong>{relation.relatedLabel}</strong>
              <span className="relation-evidence">{countLabel(relation.fileDependencies.length, 'supporting file relationship')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
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

function attentionFlowNode(
  node: Node<ExplorerNodeData>,
  attention: ExplorerNodeAttention | undefined,
): Node<ExplorerNodeData> {
  const resolvedAttention = attention ?? {
    role: 'baseline',
    selected: false,
    anchorRelationshipRole: 'unrelated',
    selectedRelationshipRole: 'unrelated',
  } satisfies ExplorerNodeAttention;
  const classes = ['graph-node'];

  if (node.data.kind === 'workspace-package') classes.push('graph-node-package');
  if (node.data.kind === 'external') classes.push('graph-node-external');
  if (node.data.scopeRole === 'contextual') classes.push('graph-node-contextual');
  classes.push(`graph-node-attention-${resolvedAttention.role}`);
  const visibleRelationshipRole = resolvedAttention.anchorRelationshipRole === 'unrelated'
    ? resolvedAttention.selectedRelationshipRole
    : resolvedAttention.anchorRelationshipRole;
  if (resolvedAttention.role === 'direct' && visibleRelationshipRole === 'uses') classes.push('graph-node-dependency');
  if (resolvedAttention.role === 'direct' && visibleRelationshipRole === 'used-by') classes.push('graph-node-dependent');
  if (resolvedAttention.role === 'anchor') classes.push('graph-node-target');
  if (resolvedAttention.selected) classes.push('graph-node-selected');

  return {
    ...node,
    type: 'explorer',
    className: classes.join(' '),
    data: {
      ...node.data,
      attentionRole: resolvedAttention.role,
      selectedForInspection: resolvedAttention.selected,
      attentionLabel: nodeAttentionLabel(node, resolvedAttention),
    },
  };
}

function nodeAttentionLabel(
  node: Node<ExplorerNodeData>,
  attention: ExplorerNodeAttention,
): string | undefined {
  const labels: string[] = [];

  if (attention.role === 'anchor') labels.push('Connection anchor');
  else if (attention.anchorRelationshipRole === 'uses') labels.push('Anchor uses this');
  else if (attention.anchorRelationshipRole === 'used-by') labels.push('Uses the anchor');
  else if (attention.role === 'additional-context') labels.push('Additional context');
  if (!attention.selected && attention.role === 'direct' && attention.anchorRelationshipRole === 'unrelated') {
    if (attention.selectedRelationshipRole === 'uses') labels.push('Selected item uses this');
    else if (attention.selectedRelationshipRole === 'used-by') labels.push('Uses selected item');
  }
  if (attention.selected) labels.push(node.data.kind === 'workspace-package' ? 'Selected for inspection' : 'Selected');

  return labels.length > 0 ? labels.join(' · ') : undefined;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function evidenceLabel(evidence: WorkspacePackage['evidence'][number]): string {
  if (evidence.kind === 'workspace-pattern') {
    return `Workspace pattern: ${evidence.pattern}`;
  }

  return evidence.kind === 'workspace-configuration'
    ? `Workspace configuration: ${evidence.path}`
    : `Package manifest: ${evidence.path}`;
}

function relationLabel(edge: ProjectGraphEdge): string {
  const location = edge.evidence.location;
  return `${edge.moduleSpecifier} at ${location.filePath}:${location.line}:${location.column} (${edge.confidence})`;
}

function FileRelationList({
  title,
  emptyMessage,
  relations,
}: {
  title: string;
  emptyMessage: string;
  relations: FileExplorationRelation[];
}) {
  return (
    <section className="relation-list">
      <h3>{title}</h3>
      {relations.length === 0 ? <p className="part-state-explanation">{emptyMessage}</p> : (
        <ul>
          {relations.map((relation) => (
            <li
              key={`${relation.sourceNodeId}->${relation.targetNodeId}`}
              aria-label={describeRelationship(relation.sourceLabel, relation.targetLabel)}
            >
              <strong>{relation.relatedLabel}</strong>
              <span className="file-relation-context">{relation.relatedContextLabel}</span>
              <span className="relation-evidence">{countLabel(relation.occurrences.length, 'relationship')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FileEvidence({ exploration }: { exploration: FileExploration }) {
  return (
    <div className="file-evidence">
      <p>Exact analyzed occurrences supporting the relationships shown above.</p>
      <VocabularyHelp placement="evidence" label="Learn about this evidence" />
      <FileEvidenceGroup title="Uses evidence" relations={exploration.uses} />
      <FileEvidenceGroup title="Used by evidence" relations={exploration.usedBy} />
    </div>
  );
}

function FileEvidenceGroup({ title, relations }: { title: string; relations: FileExplorationRelation[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {relations.length === 0 ? <p className="muted">No supporting occurrences for this direction.</p> : (
        <ul className="file-evidence-relations">
          {relations.map((relation) => (
            <li key={`${relation.sourceNodeId}->${relation.targetNodeId}`}>
              <strong>{describeRelationship(relation.sourceLabel, relation.targetLabel)}</strong>
              <span>{countLabel(relation.occurrences.length, 'occurrence')}</span>
              <ol>
                {relation.occurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    <dl>
                      <div><dt>Module specifier</dt><dd>{occurrence.moduleSpecifier}</dd></div>
                      <div><dt>Source ID</dt><dd>{occurrence.sourceNodeId}</dd></div>
                      <div><dt>Target ID</dt><dd>{occurrence.targetNodeId}</dd></div>
                      <div><dt>Evidence file</dt><dd>{occurrence.evidence.location.filePath}</dd></div>
                      <div><dt>Line</dt><dd>{occurrence.evidence.location.line}</dd></div>
                      <div><dt>Column</dt><dd>{occurrence.evidence.location.column}</dd></div>
                      <div><dt>Confidence</dt><dd>{occurrence.confidence}</dd></div>
                    </dl>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function relationshipFlowEdge(edge: ExplorerEdge, attention: ExplorerEdgeAttention | undefined): ExplorerEdge {
  const role = attention?.relationshipRole ?? 'unrelated';
  const attentionRole = attention?.role ?? 'baseline';
  const labelled = attentionRole === 'direct' || attentionRole === 'selected-context';
  const occurrenceSuffix = edge.data && edge.data.occurrenceCount > 1
    ? ` · ${edge.data.occurrenceCount} relationships`
    : '';

  return {
    ...edge,
    className: `graph-edge graph-edge-attention-${attentionRole}${role !== 'unrelated' ? ` graph-edge-${role}` : ''}`,
    label: labelled && role === 'uses' ? `Uses${occurrenceSuffix}` : labelled && role === 'used-by' ? `Used by${occurrenceSuffix}` : undefined,
    labelStyle: labelled ? { fill: '#edf5f7', fontSize: 11, fontWeight: 700 } : undefined,
    labelBgStyle: labelled ? { fill: '#17232e', fillOpacity: 0.96, stroke: '#78909c', strokeWidth: 1 } : undefined,
    labelBgPadding: labelled ? [6, 4] : undefined,
    labelBgBorderRadius: labelled ? 4 : undefined,
    markerEnd: {
      type: 'arrowclosed',
      width: attentionRole === 'direct' ? 25 : 22,
      height: attentionRole === 'direct' ? 25 : 22,
      color: attentionRole === 'direct'
        ? '#f2c14e'
        : attentionRole === 'subdued' || attentionRole === 'additional-context'
          ? '#60717e'
          : '#8fa2b1',
    },
  };
}

function fitViewOptions(mode: ExplorerElements['mode']) {
  return {
    padding: mode === 'system' ? 0.2 : 0.14,
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
    minZoom: mode === 'system' ? 0.55 : 0.68,
    maxZoom: 1.15,
  };
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Explorer root element not found.');
}

createRoot(root).render(<App />);
