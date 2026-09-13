import { useMemo, useState } from 'react';
import type { Responsibility, ResponsibilityFinding } from '@bunker-code/contracts';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type {
  ExplorerSystemMapItem,
  ExplorerSystemMapProjection,
  ExplorerSystemMapRelation,
} from './explorer-system-map-projection.js';
import {
  createSystemMapFieldModel,
  createSystemMapFieldRelationRoute,
  createSystemMapFieldSelection,
  systemMapFieldDimensions,
  type SystemMapFieldItemAttention,
  type SystemMapFieldHandleSide,
  type SystemMapFieldRelationDirection,
} from './explorer-system-map-field-model.js';
import {
  systemMapResponsibilityOverlay,
  type ExplorerSystemMapResponsibilityLocation,
  type ExplorerSystemMapResponsibilityOverlay,
  type ExplorerSystemMapResponsibilityOverlayProjection,
} from './explorer-system-map-responsibility-overlay.js';
import {
  coverageStatusLabel,
  responsibilityLabel,
  responsibilityLocationLabel,
  responsibilitySubjectLabel,
} from './explorer-responsibility-language.js';
import {
  systemMapContextForItem,
  type ExplorerSystemMapContextProjection,
} from './explorer-system-map-context.js';

interface FieldNodeData extends Record<string, unknown> {
  item?: ExplorerSystemMapItem;
  kind: 'territory' | 'file' | 'direct-files-band';
  label: string;
  attention: SystemMapFieldItemAttention;
  overlay: 'inactive' | 'observed' | 'not-observed';
  overlayLabel?: string;
  overlayFindingCount?: number;
  onSelect?: () => void;
  onOpen?: () => void;
}

interface FieldEdgeData extends Record<string, unknown> {
  relation: ExplorerSystemMapRelation;
  sourceLabel: string;
  targetLabel: string;
  direction?: SystemMapFieldRelationDirection;
  investigated: boolean;
}

type FieldNode = Node<FieldNodeData>;
type FieldEdge = Edge<FieldEdgeData>;

const nodeTypes = { fieldItem: FieldItemNode, fieldBand: FieldBandNode };
const edgeTypes = { fieldRelation: FieldRelationEdge };

export function ExplorerSystemMapField({
  projectLabel,
  projection,
  responsibilityOverlays,
  systemContext,
  activeResponsibility,
  onResponsibilityOverlayChange,
  onOpenTerritory,
  onOpenFile,
}: {
  projectLabel: string;
  projection: Extract<ExplorerSystemMapProjection, { status: 'ready' }>;
  responsibilityOverlays: ExplorerSystemMapResponsibilityOverlayProjection;
  systemContext: ExplorerSystemMapContextProjection;
  activeResponsibility: Responsibility | null;
  onResponsibilityOverlayChange(responsibility: Responsibility | null): void;
  onOpenTerritory(territoryId: string): void;
  onOpenFile(fileId: string): void;
}) {
  const model = useMemo(() => createSystemMapFieldModel(projection), [projection]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const selection = useMemo(
    () => createSystemMapFieldSelection(model, selectedItemId),
    [model, selectedItemId],
  );
  const activeOverlay = useMemo(
    () => systemMapResponsibilityOverlay(responsibilityOverlays, activeResponsibility),
    [activeResponsibility, responsibilityOverlays],
  );
  const overlayLocationsByItemId = useMemo(
    () => new Map(activeOverlay?.locations.map((location) => [location.itemId, location] as const) ?? []),
    [activeOverlay],
  );
  const itemsById = useMemo(() => new Map(projection.items.map((item) => [item.id, item] as const)), [projection.items]);
  const nodes = useMemo(() => createFieldNodes(
    model,
    selection.itemAttention,
    activeOverlay,
    overlayLocationsByItemId,
    (item) => {
      setSelectedRelationId(null);
      setSelectedItemId(item.id);
    },
    (item) => item.kind === 'territory' ? onOpenTerritory(item.territory.id) : onOpenFile(item.file.id),
  ), [activeOverlay, model, onOpenFile, onOpenTerritory, overlayLocationsByItemId, selection.itemAttention]);
  const edges = useMemo(() => model.relations.map((relation): FieldEdge => {
    const direction = selection.relationDirections.get(relation.id);
    const route = createSystemMapFieldRelationRoute(model, relation);
    const source = itemsById.get(relation.sourceItemId);
    const target = itemsById.get(relation.targetItemId);
    if (!source || !target) throw new Error(`Territory Field relation references an unknown item: ${relation.id}`);
    return {
      id: relation.id,
      source: relation.sourceItemId,
      target: relation.targetItemId,
      sourceHandle: 'source-' + route.sourceSide,
      targetHandle: 'target-' + route.targetSide,
      type: 'fieldRelation',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: direction ? 18 : 13,
        height: direction ? 18 : 13,
        color: relationColor(direction),
      },
      ariaLabel: `${source.label} uses ${target.label}. ${relation.observedDependencyCount} observed internal file ${relation.observedDependencyCount === 1 ? 'dependency' : 'dependencies'}.`,
      focusable: true,
      selectable: true,
      zIndex: direction ? 3 : 1,
      data: {
        relation,
        sourceLabel: source.label,
        targetLabel: target.label,
        direction,
        investigated: selectedRelationId === relation.id,
      },
    };
  }), [itemsById, model.relations, selectedRelationId, selection.relationDirections]);
  const selectedItem = selectedItemId ? itemsById.get(selectedItemId) : undefined;
  const selectedItemContext = useMemo(
    () => selectedItemId ? systemMapContextForItem(systemContext, selectedItemId) : systemContext,
    [selectedItemId, systemContext],
  );
  const selectedRelation = selectedRelationId
    ? projection.relations.find((relation) => relation.id === selectedRelationId)
    : undefined;
  const dependencyCount = projection.relations.reduce((total, relation) => total + relation.observedDependencyCount, 0);

  return (
    <section
      className="system-map system-map-field"
      data-system-map
      data-system-map-grammar="field"
      data-system-map-status="ready"
      data-system-map-item-count={projection.items.length}
      data-system-map-relation-count={projection.relations.length}
      data-system-map-dependency-count={dependencyCount}
      data-selected-system-map-item={selectedItemId ?? ''}
      data-system-map-overlay={activeOverlay?.responsibility ?? 'structure'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setSelectedItemId(null);
        setSelectedRelationId(null);
      }}
      aria-labelledby="system-map-field-title"
    >
      <header className="system-map-heading system-map-field-heading">
        <div>
          <p className="eyebrow">System Map · structure inside src</p>
          <h2 id="system-map-field-title">{projectLabel}</h2>
        </div>
        <dl className="system-map-summary" aria-label="Territory Field factual summary">
          <div><dt>Visual items</dt><dd>{projection.items.length}</dd></div>
          <div><dt>Directed relations</dt><dd>{projection.relations.length}</dd></div>
          <div><dt>File dependencies represented</dt><dd>{dependencyCount}</dd></div>
        </dl>
        <div className="system-map-field-key" aria-label="Territory Field selection legend">
          <label className="system-map-overlay-control">
            <span>Overlay</span>
            <select
              aria-label="Responsibility overlay"
              value={activeOverlay?.responsibility ?? ''}
              onChange={(event) => {
                const overlay = responsibilityOverlays.overlays.find((candidate) => candidate.responsibility === event.target.value);
                onResponsibilityOverlayChange(overlay?.responsibility ?? null);
              }}
            >
              <option value="">Structure</option>
              {responsibilityOverlays.overlays.map((overlay) => (
                <option key={overlay.responsibility} value={overlay.responsibility}>{responsibilityLabel(overlay.responsibility)}</option>
              ))}
            </select>
          </label>
          <span><i className="field-key-outgoing" />Uses</span>
          <span><i className="field-key-incoming" />Used by</span>
          <span>Uses / Used by = observed static dependencies</span>
          <span>Position is schematic only</span>
        </div>
      </header>
      <div className="system-map-field-workspace" data-primary-explorer-surface>
        <div className="system-map-canvas system-map-field-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.14, minZoom: 0.48, maxZoom: 1.08 }}
            minZoom={0.3}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => node.data.item && setSelectedItemId(node.data.item.id)}
            onEdgeClick={(_, edge) => {
              setSelectedItemId(null);
              setSelectedRelationId(edge.id);
            }}
            onPaneClick={() => {
              setSelectedItemId(null);
              setSelectedRelationId(null);
            }}
          >
            <Background color="#24343d" gap={36} size={0.65} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className="system-map-field-rail" aria-label="System Map inspector">
          {selectedItem ? (
            <FieldItemInspector
              item={selectedItem}
              relations={projection.relations}
              itemsById={itemsById}
              activeOverlay={activeOverlay}
              overlayLocation={overlayLocationsByItemId.get(selectedItem.id)}
              systemContext={selectedItemContext}
              onOpen={() => selectedItem.kind === 'territory'
                ? onOpenTerritory(selectedItem.territory.id)
                : onOpenFile(selectedItem.file.id)}
              onInspectRelation={(relationId) => {
                setSelectedItemId(null);
                setSelectedRelationId(relationId);
              }}
            />
          ) : selectedRelation ? (
            <FieldRelationInspector relation={selectedRelation} itemsById={itemsById} />
          ) : (
            <FieldSystemSummary overlay={activeOverlay} systemContext={systemContext} />
          )}
        </aside>
      </div>
    </section>
  );
}

function createFieldNodes(
  model: ReturnType<typeof createSystemMapFieldModel>,
  attention: Map<string, SystemMapFieldItemAttention>,
  activeOverlay: ExplorerSystemMapResponsibilityOverlay | null,
  overlayLocationsByItemId: ReadonlyMap<string, ExplorerSystemMapResponsibilityLocation>,
  onSelect: (item: ExplorerSystemMapItem) => void,
  onOpen: (item: ExplorerSystemMapItem) => void,
): FieldNode[] {
  const band = model.directFilesBand ? [{
    id: 'system-map-field:direct-files-band',
    type: 'fieldBand',
    position: model.directFilesBand.position,
    style: { width: model.directFilesBand.width, height: model.directFilesBand.height },
    selectable: false,
    focusable: false,
    zIndex: 0,
    data: { kind: 'direct-files-band' as const, label: 'Direct files in src', attention: 'resting' as const, overlay: 'inactive' as const },
  }] : [];
  return [
    ...band,
    ...model.items.map(({ item, position }): FieldNode => {
      const overlayLocation = overlayLocationsByItemId.get(item.id);
      return {
        id: item.id,
        type: 'fieldItem',
        position,
        style: systemMapFieldDimensions[item.kind],
        zIndex: attention.get(item.id) === 'selected' ? 5 : 2,
        data: {
          item,
          kind: item.kind,
          label: item.label,
          attention: attention.get(item.id) ?? 'resting',
          overlay: activeOverlay === null ? 'inactive' : overlayLocation ? 'observed' : 'not-observed',
          overlayLabel: activeOverlay ? responsibilityLabel(activeOverlay.responsibility) : undefined,
          overlayFindingCount: overlayLocation?.findingCount,
          onSelect: () => onSelect(item),
          onOpen: () => onOpen(item),
        },
      };
    }),
  ];
}

function FieldItemNode({ data }: NodeProps<FieldNode>) {
  const item = data.item;
  if (!item) return null;
  const fileCount = item.kind === 'territory' ? item.territory.analyzedFileCount : null;
  return (
    <div
      className={`system-map-field-item system-map-field-item-${data.kind} field-attention-${data.attention} field-overlay-${data.overlay}`}
      data-system-map-item-kind={data.kind}
      data-system-map-item-id={item.id}
      data-field-attention={data.attention}
      data-responsibility-overlay-state={data.overlay}
      data-responsibility-finding-count={data.overlayFindingCount ?? 0}
    >
      <FieldHandles type="target" />
      <button
        type="button"
        className="nodrag nopan"
        aria-pressed={data.attention === 'selected'}
        aria-label={`${data.kind === 'territory' ? 'Territory' : 'Direct file'} ${data.label}`}
        onClick={data.onSelect}
        onDoubleClick={data.onOpen}
      >
        {data.kind === 'territory' ? <span>Territory</span> : null}
        <strong>{data.label}</strong>
        {fileCount !== null ? <small>{fileCount} analyzed file{fileCount === 1 ? '' : 's'}</small> : null}
        {data.overlay === 'observed' ? (
          <small className="system-map-overlay-marker" title={`${data.overlayLabel}: ${data.overlayFindingCount} observed finding${data.overlayFindingCount === 1 ? '' : 's'}`}>
            {data.overlayFindingCount} observed
          </small>
        ) : null}
      </button>
      <FieldHandles type="source" />
    </div>
  );
}

function FieldHandles({ type }: { type: 'source' | 'target' }) {
  const positions: Array<{ side: SystemMapFieldHandleSide; position: Position }> = [
    { side: 'top', position: Position.Top },
    { side: 'right', position: Position.Right },
    { side: 'bottom', position: Position.Bottom },
    { side: 'left', position: Position.Left },
  ];
  return positions.map(({ side, position }) => (
    <Handle key={side} id={type + '-' + side} type={type} position={position} />
  ));
}

function FieldBandNode({ data }: NodeProps<FieldNode>) {
  return <div className="system-map-field-band"><strong>{data.label}</strong></div>;
}

function FieldRelationEdge(props: EdgeProps<FieldEdge>) {
  const [path, labelX, labelY] = getBezierPath(props);
  const direction = props.data?.direction;
  const investigated = props.data?.investigated ?? false;
  const className = direction ? `field-relation field-relation-${direction}` : investigated ? 'field-relation field-relation-investigated' : 'field-relation field-relation-resting';
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        interactionWidth={props.interactionWidth}
        className={className}
        style={{ stroke: relationColor(direction), strokeWidth: direction || investigated ? 2.5 : 0.85 }}
      />
      {investigated ? (
        <EdgeLabelRenderer>
          <div className="system-map-field-edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {props.data?.relation.observedDependencyCount} observed
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function FieldItemInspector({
  item,
  relations,
  itemsById,
  activeOverlay,
  overlayLocation,
  systemContext,
  onOpen,
  onInspectRelation,
}: {
  item: ExplorerSystemMapItem;
  relations: ExplorerSystemMapRelation[];
  itemsById: Map<string, ExplorerSystemMapItem>;
  activeOverlay: ExplorerSystemMapResponsibilityOverlay | null;
  overlayLocation?: ExplorerSystemMapResponsibilityLocation;
  systemContext: ExplorerSystemMapContextProjection;
  onOpen(): void;
  onInspectRelation(relationId: string): void;
}) {
  const outgoing = relations.filter((relation) => relation.sourceItemId === item.id);
  const incoming = relations.filter((relation) => relation.targetItemId === item.id);
  return (
    <div className="system-map-field-inspector" data-system-map-field-inspector={item.id} aria-live="polite">
      <div><span>{item.kind === 'territory' ? 'Territory' : 'Direct file'}</span><strong>{item.label}</strong></div>
      <section className="system-map-field-inspector-section" aria-labelledby="structural-connections-title">
        <h3 id="structural-connections-title">Structural connections</h3>
        <RelationList label="Uses" direction="outgoing" relations={outgoing} itemsById={itemsById} onInspect={onInspectRelation} />
        <RelationList label="Used by" direction="incoming" relations={incoming} itemsById={itemsById} onInspect={onInspectRelation} />
      </section>
      {activeOverlay ? (
        <FieldResponsibilityEvidence overlay={activeOverlay} location={overlayLocation} />
      ) : null}
      <FieldSystemContext context={systemContext} scope="item" />
      <button type="button" onClick={onOpen}>{item.kind === 'territory' ? 'Open Territory' : 'Inspect file'}</button>
    </div>
  );
}

function FieldSystemSummary({
  overlay,
  systemContext,
}: {
  overlay: ExplorerSystemMapResponsibilityOverlay | null;
  systemContext: ExplorerSystemMapContextProjection;
}) {
  return (
    <div className="system-map-field-summary">
      {overlay ? <FieldOverlaySummary overlay={overlay} /> : (
        <div className="system-map-field-empty-inspector">
          <span>System Map inspector</span>
          <p>Select a Territory or direct file to inspect its connections.</p>
        </div>
      )}
      <FieldSystemContext context={systemContext} scope="system" />
    </div>
  );
}

function FieldSystemContext({
  context,
  scope,
}: {
  context: ExplorerSystemMapContextProjection;
  scope: 'system' | 'item';
}) {
  return (
    <section className="system-map-field-inspector-section system-map-context" data-system-map-context={scope}>
      <h3>System context</h3>
      <p>Territories represent observed structure; architectural role is not inferred.</p>
      {context.externalTouchpoints.length > 0 ? (
        <details data-system-context-section="external-touchpoints">
          <summary>External touchpoints <small>{context.externalTouchpoints.length} observed module{context.externalTouchpoints.length === 1 ? '' : 's'}</small></summary>
          <p>Analyzed files represented here import these external modules. Runtime communication is not established.</p>
          <ul>{context.externalTouchpoints.map((touchpoint) => (
            <li key={touchpoint.moduleSpecifier} data-external-touchpoint={touchpoint.moduleSpecifier}>
              <strong><code>{touchpoint.moduleSpecifier}</code></strong>
              <span>{touchpoint.sources.length} observed import location{touchpoint.sources.length === 1 ? '' : 's'}</span>
              <details>
                <summary>How BunkerCode knows</summary>
                <ul>{touchpoint.sources.map(({ edge }) => (
                  <li key={edge.id}>
                    <code>{edge.sourceNodeId}</code>
                    <span>{edge.evidence.location.filePath}:{edge.evidence.location.line}:{edge.evidence.location.column} · {edge.confidence}</span>
                  </li>
                ))}</ul>
              </details>
            </li>
          ))}</ul>
        </details>
      ) : null}
      {context.analysisLimits.length > 0 ? (
        <details data-system-context-section="analysis-limits">
          <summary>Analysis limits <small>{context.analysisLimits.length} incomplete evaluation{context.analysisLimits.length === 1 ? '' : 's'}</small></summary>
          <p>Incomplete evaluation is not evidence that a Responsibility is absent.</p>
          <ul>{context.analysisLimits.map((limit) => (
            <li key={`${limit.coverage.capability}:${coverageScopeKey(limit.coverage)}`} data-analysis-limit={limit.coverage.status}>
              <strong>{responsibilityLabel(limit.coverage.capability)}</strong>
              <span>{coverageStatusLabel(limit.coverage.status)} · {coverageScopeLabel(limit.coverage)}</span>
              {limit.limitations.map((limitation) => <span key={limitation.id}>{limitation.message}</span>)}
              {limit.coverage.status === 'failed' ? <span>{limit.coverage.failure.message}</span> : null}
            </li>
          ))}</ul>
        </details>
      ) : null}
      {context.unresolvedDependencies.length > 0 ? (
        <details data-system-context-section="unresolved-dependencies">
          <summary>Unresolved dependencies <small>{context.unresolvedDependencies.length} observed</small></summary>
          <ul>{context.unresolvedDependencies.map(({ dependency }) => (
            <li key={dependency.id} data-unresolved-dependency={dependency.id}>
              <strong><code>{dependency.moduleSpecifier}</code></strong>
              <span>{dependency.reason}</span>
              <span>{dependency.evidence.location.filePath}:{dependency.evidence.location.line}:{dependency.evidence.location.column} · {dependency.confidence}</span>
            </li>
          ))}</ul>
        </details>
      ) : null}
      {context.cycles.length > 0 ? (
        <details data-system-context-section="dependency-cycles">
          <summary>Dependency cycles <small>{context.cycles.length} observed</small></summary>
          <ul>{context.cycles.map((cycle) => <li key={cycle.id}>{cycle.fileIds.join(' → ')}</li>)}</ul>
        </details>
      ) : null}
      {context.isolatedFiles.length > 0 ? (
        <details data-system-context-section="isolated-files">
          <summary>Isolated files <small>{context.isolatedFiles.length} observed</small></summary>
          <ul>{context.isolatedFiles.map((file) => <li key={file.fileId}><code>{file.fileId}</code></li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}

function coverageScopeLabel(coverage: ExplorerSystemMapContextProjection['analysisLimits'][number]['coverage']): string {
  if (coverage.scope.kind === 'project') return 'project scope';
  if (coverage.scope.kind === 'file') return coverage.scope.fileId;
  return `${coverage.scope.fileId} · subject ${coverage.scope.subjectId}`;
}

function coverageScopeKey(coverage: ExplorerSystemMapContextProjection['analysisLimits'][number]['coverage']): string {
  if (coverage.scope.kind === 'project') return 'project';
  if (coverage.scope.kind === 'file') return `file:${coverage.scope.fileId}`;
  return `subject:${coverage.scope.fileId}:${coverage.scope.subjectId}`;
}

function FieldOverlaySummary({ overlay }: { overlay: ExplorerSystemMapResponsibilityOverlay }) {
  return (
    <div className="system-map-field-empty-inspector system-map-overlay-summary" data-system-map-overlay-summary={overlay.responsibility}>
      <span>Responsibility overlay</span>
      <strong>{responsibilityLabel(overlay.responsibility)}</strong>
      <p>Observed in {overlay.locations.length} map location{overlay.locations.length === 1 ? '' : 's'}.</p>
      <p>{overlay.findingCount} factual finding{overlay.findingCount === 1 ? '' : 's'} in this System Map slice.</p>
    </div>
  );
}

function FieldResponsibilityEvidence({
  overlay,
  location,
}: {
  overlay: ExplorerSystemMapResponsibilityOverlay;
  location?: ExplorerSystemMapResponsibilityLocation;
}) {
  return (
    <section className="system-map-field-inspector-section system-map-overlay-evidence" data-system-map-responsibility-evidence={overlay.responsibility}>
      <h3>Responsibility evidence</h3>
      <strong>{responsibilityLabel(overlay.responsibility)}</strong>
      {!location ? (
        <p>No finding for this Responsibility was observed in this map item.</p>
      ) : (
        <>
          <p>{location.findingCount} observed finding{location.findingCount === 1 ? '' : 's'}.</p>
          <ul>{location.findings.map((finding) => <ResponsibilityFindingEvidence key={finding.id} finding={finding} />)}</ul>
        </>
      )}
    </section>
  );
}

function ResponsibilityFindingEvidence({ finding }: { finding: ResponsibilityFinding }) {
  return (
    <li className="system-map-overlay-finding" data-system-map-responsibility-finding={finding.id}>
      <strong>{responsibilitySubjectLabel(finding.subject)}</strong>
      <span>{responsibilityLocationLabel(finding.subject)} · {finding.confidence}</span>
      <details>
        <summary>How BunkerCode knows</summary>
        <span>Detector {finding.provenance.detector.id}@{finding.provenance.detector.version} · Rule {finding.provenance.ruleId}@{finding.provenance.ruleVersion}</span>
        <ul>{finding.evidence.map((evidence) => <li key={evidence.id}>
          <strong>{evidence.technology.displayName}: {evidence.signal}</strong>
          <span>{evidence.location.filePath}:{evidence.location.line}:{evidence.location.column}</span>
        </li>)}</ul>
      </details>
    </li>
  );
}

function RelationList({ label, direction, relations, itemsById, onInspect }: {
  label: string;
  direction: SystemMapFieldRelationDirection;
  relations: ExplorerSystemMapRelation[];
  itemsById: Map<string, ExplorerSystemMapItem>;
  onInspect(relationId: string): void;
}) {
  return (
    <section data-field-relation-group={direction}>
      <h3>{label}</h3>
      {relations.length === 0 ? <p>None observed</p> : <ul>{relations.map((relation) => {
        const relatedId = direction === 'outgoing' ? relation.targetItemId : relation.sourceItemId;
        return <li key={relation.id}><button type="button" onClick={() => onInspect(relation.id)}><span>{itemsById.get(relatedId)?.label}</span><small>{relation.observedDependencyCount} observed</small></button></li>;
      })}</ul>}
    </section>
  );
}

function FieldRelationInspector({ relation, itemsById }: {
  relation: ExplorerSystemMapRelation;
  itemsById: Map<string, ExplorerSystemMapItem>;
}) {
  return (
    <div className="system-map-field-inspector system-map-field-relation-inspector" data-system-map-field-relation={relation.id} aria-live="polite">
      <div><span>Observed relation</span><strong>{itemsById.get(relation.sourceItemId)?.label} uses {itemsById.get(relation.targetItemId)?.label}</strong></div>
      <p>{relation.observedDependencyCount} internal file {relation.observedDependencyCount === 1 ? 'dependency' : 'dependencies'}</p>
      <details>
        <summary>How BunkerCode knows</summary>
        <ul>{relation.fileEdges.map((edge) => <li key={edge.id}>
          <code>{edge.sourceNodeId}</code> uses <code>{edge.targetNodeId}</code>
          <span>{edge.evidence.location.filePath}:{edge.evidence.location.line}:{edge.evidence.location.column} · {edge.confidence}</span>
        </li>)}</ul>
      </details>
    </div>
  );
}

function relationColor(direction?: SystemMapFieldRelationDirection): string {
  return direction === 'outgoing' ? '#6eb7df' : direction === 'incoming' ? '#73c8bb' : '#607782';
}
