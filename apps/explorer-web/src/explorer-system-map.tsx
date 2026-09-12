import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type {
  ExplorerSystemMapItem,
  ExplorerSystemMapProjection,
  ExplorerSystemMapRelation,
} from './explorer-system-map-projection.js';

interface SystemMapNodeData extends Record<string, unknown> {
  kind: 'territory' | 'file' | 'direct-files-band';
  label: string;
  path?: string;
  analyzedFileCount?: number;
  onOpen?: () => void;
}

interface SystemMapEdgeData extends Record<string, unknown> {
  relation: ExplorerSystemMapRelation;
}

type SystemMapNode = Node<SystemMapNodeData>;
type SystemMapEdge = Edge<SystemMapEdgeData>;

interface SystemMapElements {
  nodes: SystemMapNode[];
  edges: SystemMapEdge[];
}

const territoryDimensions = { width: 224, height: 94 };
const fileDimensions = { width: 190, height: 88 };
const elk = new ELK();
const nodeTypes = {
  systemMapItem: SystemMapItemNode,
  directFilesBand: DirectFilesBandNode,
};

export function ExplorerSystemMap({
  projectLabel,
  projection,
  onOpenTerritory,
  onOpenFile,
  onExploreStructure,
}: {
  projectLabel: string;
  projection: ExplorerSystemMapProjection;
  onOpenTerritory(territoryId: string): void;
  onOpenFile(fileId: string): void;
  onExploreStructure(): void;
}) {
  const projectedElements = useMemo(
    () => projection.status === 'ready'
      ? createSystemMapElements(projection, onOpenTerritory, onOpenFile)
      : null,
    [onOpenFile, onOpenTerritory, projection],
  );
  const [elements, setElements] = useState<SystemMapElements | null>(null);
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!projectedElements) {
      setElements(null);
      setLayoutState('ready');
      return;
    }

    let active = true;
    setLayoutState('loading');
    void layoutSystemMapElements(projectedElements).then((nextElements) => {
      if (!active) return;
      setElements(nextElements);
      setLayoutState('ready');
    }).catch(() => {
      if (active) setLayoutState('error');
    });
    return () => { active = false; };
  }, [projectedElements]);

  if (projection.status === 'source-territory-unavailable') {
    return (
      <section className="system-map system-map-unavailable" data-system-map data-system-map-status="source-territory-unavailable">
        <SystemMapHeading projectLabel={projectLabel} itemCount={0} relationCount={0} dependencyCount={0} />
        <div className="system-map-empty-region" data-primary-explorer-surface>
          <div className="system-map-empty">
            <p className="eyebrow">System Map boundary</p>
            <h2>No <code>src</code> Territory was observed</h2>
            <p>This first slice only maps structural content directly inside <code>src</code>. No alternative area is inferred.</p>
            <button type="button" onClick={onExploreStructure}>Explore all Territories</button>
          </div>
        </div>
      </section>
    );
  }

  const dependencyCount = projection.relations.reduce(
    (total, relation) => total + relation.observedDependencyCount,
    0,
  );

  return (
    <section
      className="system-map"
      data-system-map
      data-system-map-status="ready"
      data-system-map-item-count={projection.items.length}
      data-system-map-relation-count={projection.relations.length}
      data-system-map-dependency-count={dependencyCount}
      aria-labelledby="system-map-title"
    >
      <SystemMapHeading
        projectLabel={projectLabel}
        itemCount={projection.items.length}
        relationCount={projection.relations.length}
        dependencyCount={dependencyCount}
      />
      <div className="system-map-canvas" data-primary-explorer-surface>
        {elements ? (
          <ReactFlow
            nodes={elements.nodes}
            edges={elements.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.16, minZoom: 0.42, maxZoom: 1.08 }}
            minZoom={0.3}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background color="#2a3b46" gap={24} size={0.8} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : null}
        {layoutState === 'loading' ? (
          <div className="graph-status" role="status"><span className="graph-status-pulse" />Arranging System Map...</div>
        ) : null}
        {layoutState === 'error' ? (
          <div className="graph-status graph-status-error" role="alert">Unable to arrange this map. The projected facts remain unchanged.</div>
        ) : null}
      </div>
    </section>
  );
}

function SystemMapHeading({
  projectLabel,
  itemCount,
  relationCount,
  dependencyCount,
}: {
  projectLabel: string;
  itemCount: number;
  relationCount: number;
  dependencyCount: number;
}) {
  return (
    <header className="system-map-heading">
      <div>
        <p className="eyebrow">System Map · directly inside src</p>
        <h2 id="system-map-title">{projectLabel}</h2>
      </div>
      <dl className="system-map-summary" aria-label="System Map factual summary">
        <div><dt>Visual items</dt><dd>{itemCount}</dd></div>
        <div><dt>Directed relations</dt><dd>{relationCount}</dd></div>
        <div><dt>File dependencies represented</dt><dd>{dependencyCount}</dd></div>
      </dl>
      <div className="system-map-legend" aria-label="System Map legend">
        <span><i className="system-map-key-territory" />Territory = observed repository structure</span>
        <span><i className="system-map-key-file" />File = directly in src</span>
        <span><i className="system-map-key-relation" />A → B = files in A have observed internal dependencies on files in B</span>
        <span>Count = observed dependency count, not importance</span>
      </div>
    </header>
  );
}

function createSystemMapElements(
  projection: Extract<ExplorerSystemMapProjection, { status: 'ready' }>,
  onOpenTerritory: (territoryId: string) => void,
  onOpenFile: (fileId: string) => void,
): SystemMapElements {
  const itemsById = new Map(projection.items.map((item) => [item.id, item] as const));
  const nodes = projection.items.map((item): SystemMapNode => ({
    id: item.id,
    type: 'systemMapItem',
    position: { x: 0, y: 0 },
    style: item.kind === 'territory' ? territoryDimensions : fileDimensions,
    zIndex: 2,
    data: nodeData(item, onOpenTerritory, onOpenFile),
  }));
  const edges = projection.relations.map((relation): SystemMapEdge => {
    const source = itemsById.get(relation.sourceItemId);
    const target = itemsById.get(relation.targetItemId);
    if (!source || !target) throw new Error(`System Map relation references an unknown item: ${relation.id}`);
    const count = relation.observedDependencyCount;
    return {
      id: relation.id,
      source: relation.sourceItemId,
      target: relation.targetItemId,
      type: 'smoothstep',
      label: `${count} observed`,
      ariaLabel: `${source.label} to ${target.label}: ${count} observed internal file ${count === 1 ? 'dependency' : 'dependencies'}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#7f9bab' },
      style: { stroke: '#7f9bab', strokeWidth: 1.35 },
      labelStyle: { fill: '#d7e2e8', fontSize: 9, fontWeight: 700 },
      labelBgStyle: { fill: '#101b23', fillOpacity: 0.94, stroke: '#435b68', strokeWidth: 0.7 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      zIndex: 1,
      data: { relation },
    };
  });
  return { nodes, edges };
}

function nodeData(
  item: ExplorerSystemMapItem,
  onOpenTerritory: (territoryId: string) => void,
  onOpenFile: (fileId: string) => void,
): SystemMapNodeData {
  if (item.kind === 'territory') {
    return {
      kind: 'territory',
      label: item.label,
      path: item.territory.normalizedStructuralPath,
      analyzedFileCount: item.territory.analyzedFileCount,
      onOpen: () => onOpenTerritory(item.territory.id),
    };
  }
  return {
    kind: 'file',
    label: item.label,
    path: item.file.path,
    onOpen: () => onOpenFile(item.file.id),
  };
}

async function layoutSystemMapElements(elements: SystemMapElements): Promise<SystemMapElements> {
  const itemNodes = elements.nodes.filter((node) => node.data.kind !== 'direct-files-band');
  const territoryNodes = itemNodes.filter((node) => node.data.kind === 'territory');
  const directFileNodes = itemNodes.filter((node) => node.data.kind === 'file');
  const territoryIds = new Set(territoryNodes.map((node) => node.id));
  const layout = await elk.layout({
    id: 'system-map',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '86',
      'elk.spacing.nodeNode': '42',
    },
    children: territoryNodes.map((node) => ({ id: node.id, ...territoryDimensions })),
    edges: elements.edges
      .filter((edge) => territoryIds.has(edge.source) && territoryIds.has(edge.target))
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  const positions = new Map(
    (layout.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }] as const),
  );
  const territoryWidth = Math.max(territoryDimensions.width, ...territoryNodes.map((node) => {
    const position = positions.get(node.id) ?? { x: 0, y: 0 };
    return position.x + territoryDimensions.width;
  }));
  const territoryBottom = Math.max(0, ...territoryNodes.map((node) => {
    const position = positions.get(node.id) ?? { x: 0, y: 0 };
    return position.y + territoryDimensions.height;
  }));
  const fileGap = 24;
  const filesWidth = directFileNodes.length === 0
    ? 0
    : directFileNodes.length * fileDimensions.width + (directFileNodes.length - 1) * fileGap;
  const bandY = territoryBottom + 110;
  const bandWidth = Math.max(territoryWidth, filesWidth + 48);
  const bandNode: SystemMapNode | null = directFileNodes.length === 0 ? null : {
    id: 'system-map:direct-files-band',
    type: 'directFilesBand',
    position: { x: -24, y: bandY - 42 },
    style: { width: bandWidth, height: fileDimensions.height + 78 },
    selectable: false,
    focusable: false,
    zIndex: 0,
    data: { kind: 'direct-files-band', label: 'Direct files in src' },
  };
  const placedNodes = itemNodes.map((node) => {
    if (node.data.kind === 'territory') {
      return { ...node, position: positions.get(node.id) ?? node.position };
    }
    const index = directFileNodes.findIndex((candidate) => candidate.id === node.id);
    return {
      ...node,
      position: { x: index * (fileDimensions.width + fileGap), y: bandY },
    };
  });

  return { nodes: bandNode ? [bandNode, ...placedNodes] : placedNodes, edges: elements.edges };
}

function SystemMapItemNode({ data }: NodeProps<SystemMapNode>) {
  return (
    <div className={`system-map-node system-map-node-${data.kind}`} data-system-map-item-kind={data.kind}>
      <Handle type="target" position={Position.Left} />
      <span className="system-map-node-kind">{data.kind === 'territory' ? 'Territory' : 'Direct file'}</span>
      <strong title={data.path}>{data.label}</strong>
      {data.kind === 'territory' ? <span>{data.analyzedFileCount} analyzed files</span> : <span>{data.path}</span>}
      <button type="button" className="nodrag nopan" onClick={data.onOpen}>{data.kind === 'territory' ? 'Open Territory' : 'Inspect file'}</button>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function DirectFilesBandNode({ data }: NodeProps<SystemMapNode>) {
  return <div className="system-map-direct-files-band"><strong>{data.label}</strong><span>Files remain file-level landmarks, not a Territory.</span></div>;
}
