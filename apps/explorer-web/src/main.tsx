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
import { getDependencies, getDependents, getFilesInWorkspacePackage, getWorkspacePackage } from '@bunker-code/graph-engine';
import type { PackageDependency, ProjectGraph, ProjectGraphEdge, ProjectGraphNode, ProjectStructure } from '@bunker-code/graph-engine';
import type { WorkspacePackage } from '@bunker-code/contracts';
import snapshot from './generated/analyzer-typescript.snapshot.json';
import {
  createExplorerElements,
  layoutExplorerElements,
  type ExplorerElements,
  type ExplorerNode,
  type ExplorerNodeData,
} from './explorer-model.js';
import { createExplorerProjection, type ExplorerSource } from './explorer-projection.js';
import { createExplorerRuntime, type ExplorerRuntimeState } from './explorer-runtime.js';
import {
  createInitialExplorerState,
  openSelectedWorkspacePackage,
  returnToSystem,
  selectFileNode,
  selectWorkspacePackage,
  type ExplorerState,
  type WorkspacePackageExplorerState,
} from './explorer-state.js';
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

  return <Explorer graph={runtime.graph} structure={runtime.structure} packageDependencies={runtime.packageDependencies} />;
}

function Explorer({
  graph,
  structure,
  packageDependencies,
}: {
  graph: ProjectGraph;
  structure: ProjectStructure;
  packageDependencies: PackageDependency[];
}) {
  const source: ExplorerSource = useMemo(() => ({ graph, structure, packageDependencies }), [graph, structure, packageDependencies]);
  const [state, setState] = useState<ExplorerState>(() => createInitialExplorerState(structure));
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');
  const projection = useMemo(() => createExplorerProjection(source, state), [source, state]);
  const projectedElements = useMemo(() => createExplorerElements(projection), [projection]);
  const [elements, setElements] = useState<ExplorerElements>(projectedElements);
  const fileScope = state.scope === 'system' ? null : state;
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

  const selectedNodeId = fileScope?.selectedNodeId ?? null;
  const focusedNodeId = fileScope?.focusedNodeId ?? null;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedPackage = state.scope === 'system' && state.selectedPackageId
    ? getWorkspacePackage(structure, state.selectedPackageId)
    : undefined;
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
      className: nodeClassName(node, state, selectedNodeId, focusedNodeId, focusedDependencies, focusedDependents),
    })),
    [elements.nodes, state, selectedNodeId, focusedNodeId, focusedDependencies, focusedDependents],
  );
  const flowEdges: Edge[] = useMemo(
    () => elements.edges.map((edge) => ({
      ...edge,
      className: edge.source === (state.scope === 'system' ? state.selectedPackageId : selectedNodeId)
        || edge.target === (state.scope === 'system' ? state.selectedPackageId : selectedNodeId)
        ? 'graph-edge-active'
        : 'graph-edge',
    })),
    [elements.edges, state, selectedNodeId],
  );
  const dependencies = selectedNodeId ? getDependencies(graph, selectedNodeId) : [];
  const dependents = selectedNodeId ? getDependents(graph, selectedNodeId) : [];
  const canFocus = selectedNode?.kind === 'file'
    && fileScope !== null
    && fileScope.focusedNodeId !== selectedNode.id
    && isFileOwnedByScope(structure, fileScope, selectedNode.id);
  const canExpand = selectedNode?.kind === 'file'
    && fileScope !== null
    && projection.mode === 'focus'
    && projection.visibleNodeIds.has(selectedNode.id)
    && !fileScope.expandedNodeIds.has(selectedNode.id)
    && isFileOwnedByScope(structure, fileScope, selectedNode.id)
    && hasHiddenDirectContext(graph, selectedNode.id, projection.visibleNodeIds);

  function focusSelectedFile(): void {
    if (!canFocus || !selectedNode || !fileScope) {
      return;
    }

    setState({
      ...fileScope,
      focusedNodeId: selectedNode.id,
      expandedNodeIds: new Set(),
    });
    setPendingCenterNodeId(selectedNode.id);
  }

  function expandSelectedNode(): void {
    if (!canExpand || !selectedNode || !fileScope) {
      return;
    }

    setState({ ...fileScope, expandedNodeIds: new Set([...fileScope.expandedNodeIds, selectedNode.id]) });
  }

  function returnToFileOverview(): void {
    if (!fileScope) {
      return;
    }

    setState({ ...fileScope, focusedNodeId: null, expandedNodeIds: new Set() });
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

    const nextState = projection.visibleNodeIds.has(nodeId)
      ? fileScope
      : { ...fileScope, focusedNodeId: null, expandedNodeIds: new Set<string>() };
    setState(selectFileNode(nextState, nodeId));
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
          {state.scope === 'workspace-package' ? (
            <nav className="breadcrumb" aria-label="Explorer breadcrumb">
              <button type="button" onClick={returnToSystemOverview}>System</button>
              <span aria-hidden="true">/</span>
              <span>{packageLabel(getWorkspacePackage(structure, state.packageId))}</span>
            </nav>
          ) : null}
        </div>
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
          {projection.mode === 'focus' ? <button type="button" onClick={returnToFileOverview}>File overview</button> : null}
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
          {selectedPackage ? (
            <WorkspacePackageDetails
              workspacePackage={selectedPackage}
              structure={structure}
              packageDependencies={packageDependencies}
              onOpen={openSelectedPackage}
            />
          ) : selectedNode ? (
            <FileDetails
              node={selectedNode}
              dependencies={dependencies}
              dependents={dependents}
              canFocus={canFocus}
              canExpand={canExpand}
              onFocus={focusSelectedFile}
              onExpand={expandSelectedNode}
            />
          ) : (
            <div className="empty-details">
              <p className="eyebrow">{projection.mode === 'system' ? 'System overview' : projection.mode === 'focus' ? 'Focus context' : 'File overview'}</p>
              <h2>{projection.nodes.length} visible nodes</h2>
              <p>{projection.mode === 'system'
                ? 'Select a detected workspace package to inspect its evidence, then open it to investigate files.'
                : 'Find a file, select it, then focus or expand its direct structural context.'}</p>
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
      {data.filesystemGroup ? <span className="filesystem-group">Filesystem group: {data.filesystemGroup}</span> : null}
      {data.contextLabel ? <span className="graph-node-context">{data.contextLabel}</span> : null}
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function WorkspacePackageDetails({
  workspacePackage,
  structure,
  packageDependencies,
  onOpen,
}: {
  workspacePackage: WorkspacePackage;
  structure: ProjectStructure;
  packageDependencies: PackageDependency[];
  onOpen(): void;
}) {
  const outgoing = packageDependencies.filter((dependency) => dependency.sourcePackageId === workspacePackage.id);
  const incoming = packageDependencies.filter((dependency) => dependency.targetPackageId === workspacePackage.id);

  return (
    <>
      <p className="eyebrow">Selected workspace package</p>
      <h2>{packageLabel(workspacePackage)}</h2>
      <dl>
        <div><dt>Type</dt><dd>Detected workspace package</dd></div>
        <div><dt>Path</dt><dd>{workspacePackage.rootPath}</dd></div>
        <div><dt>Files</dt><dd>{getFilesInWorkspacePackage(structure, workspacePackage.id).length}</dd></div>
        <div><dt>Depends on</dt><dd>{outgoing.length}</dd></div>
        <div><dt>Used by</dt><dd>{incoming.length}</dd></div>
      </dl>
      <div className="details-actions"><button type="button" onClick={onOpen}>Open package</button></div>
      <EvidenceList evidence={workspacePackage.evidence} />
      <PackageRelationList title="Depends on" dependencies={outgoing} structure={structure} source="target" />
      <PackageRelationList title="Used by" dependencies={incoming} structure={structure} source="source" />
    </>
  );
}

function FileDetails({
  node,
  dependencies,
  dependents,
  canFocus,
  canExpand,
  onFocus,
  onExpand,
}: {
  node: ProjectGraphNode;
  dependencies: ProjectGraphEdge[];
  dependents: ProjectGraphEdge[];
  canFocus: boolean;
  canExpand: boolean;
  onFocus(): void;
  onExpand(): void;
}) {
  return (
    <>
      <p className="eyebrow">{node.kind === 'file' ? 'Selected file' : 'Selected external module'}</p>
      <h2>{nodeLabel(node)}</h2>
      <dl>
        <div><dt>ID</dt><dd>{node.id}</dd></div>
        <div><dt>Type</dt><dd>{node.kind}</dd></div>
        <div><dt>Dependencies</dt><dd>{dependencies.length}</dd></div>
        <div><dt>Dependents</dt><dd>{dependents.length}</dd></div>
      </dl>
      <div className="details-actions">
        {canFocus ? <button type="button" onClick={onFocus}>Focus file</button> : null}
        {canExpand ? <button type="button" onClick={onExpand}>Expand context</button> : null}
      </div>
      <RelationList title="Dependencies" edges={dependencies} />
      <RelationList title="Dependents" edges={dependents} />
    </>
  );
}

function EvidenceList({ evidence }: { evidence: WorkspacePackage['evidence'] }) {
  return (
    <section className="relation-list">
      <h3>Evidence</h3>
      <ul>
        {evidence.map((item) => <li key={evidenceLabel(item)}>{evidenceLabel(item)}</li>)}
      </ul>
    </section>
  );
}

function PackageRelationList({
  title,
  dependencies,
  structure,
  source,
}: {
  title: string;
  dependencies: PackageDependency[];
  structure: ProjectStructure;
  source: 'source' | 'target';
}) {
  return (
    <section className="relation-list">
      <h3>{title}</h3>
      {dependencies.length === 0 ? <p className="muted">None</p> : (
        <ul>
          {dependencies.map((dependency) => {
            const relatedPackageId = source === 'source' ? dependency.sourcePackageId : dependency.targetPackageId;
            return <li key={dependency.id}>{packageLabel(getWorkspacePackage(structure, relatedPackageId))} ({dependency.fileDependencies.length} file dependencies)</li>;
          })}
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

function nodeClassName(
  node: Node<ExplorerNodeData>,
  state: ExplorerState,
  selectedNodeId: string | null,
  focusedNodeId: string | null,
  focusedDependencies: ReadonlySet<string>,
  focusedDependents: ReadonlySet<string>,
): string {
  const classes = ['graph-node'];

  if (node.data.kind === 'workspace-package') classes.push('graph-node-package');
  if (node.data.kind === 'external') classes.push('graph-node-external');
  if (node.id === focusedNodeId) classes.push('graph-node-target');
  else if (focusedDependencies.has(node.id)) classes.push('graph-node-dependency');
  else if (focusedDependents.has(node.id)) classes.push('graph-node-dependent');
  if ((state.scope === 'system' && node.id === state.selectedPackageId) || node.id === selectedNodeId) {
    classes.push('graph-node-selected');
  }

  return classes.join(' ');
}

function nodeContextLabel(
  node: Node<ExplorerNodeData>,
  selectedNodeId: string | null,
  focusedNodeId: string | null,
  focusedDependencies: ReadonlySet<string>,
  focusedDependents: ReadonlySet<string>,
): string | undefined {
  const labels = node.data.contextLabel ? [node.data.contextLabel] : [];

  if (node.id === focusedNodeId) labels.push('Focus target');
  else if (focusedDependencies.has(node.id)) labels.push('Direct dependency');
  else if (focusedDependents.has(node.id)) labels.push('Direct dependent');
  if (node.data.kind === 'external') labels.push('External module');
  if (node.id === selectedNodeId) labels.push('Selected');

  return labels.length > 0 ? labels.join(' · ') : undefined;
}

function isFileOwnedByScope(
  structure: ProjectStructure,
  state: Exclude<ExplorerState, { scope: 'system' }>,
  nodeId: string,
): boolean {
  return state.scope === 'file-overview' || getFilesInWorkspacePackage(structure, state.packageId).includes(nodeId);
}

function hasHiddenDirectContext(graph: ProjectGraph, nodeId: string, visibleNodeIds: ReadonlySet<string>): boolean {
  return [...getDependencies(graph, nodeId), ...getDependents(graph, nodeId)].some((edge) => (
    !visibleNodeIds.has(edge.sourceNodeId) || !visibleNodeIds.has(edge.targetNodeId)
  ));
}

function nodeLabel(node: ProjectGraphNode): string {
  return node.kind === 'file' ? node.path : node.moduleSpecifier;
}

function packageLabel(workspacePackage: WorkspacePackage | undefined): string {
  return workspacePackage?.name ?? workspacePackage?.rootPath ?? 'Unknown workspace package';
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
