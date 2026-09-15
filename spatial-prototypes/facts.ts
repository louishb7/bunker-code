import { buildProjectGraph, buildProjectStructure } from '../packages/graph-engine/src/index.js';
import type { ProjectGraph, ProjectStructure } from '../packages/graph-engine/src/index.js';
import type { AnalysisResult, WorkspacePackage } from '../packages/contracts/src/index.js';
import { createExplorerSystemMapGeography } from '../apps/explorer-web/src/explorer-system-map-geography.js';
import type { ExplorerSystemMapGeography, ExplorerSystemMapLandmark } from '../apps/explorer-web/src/explorer-system-map-geography.js';
import { createExplorerSystemMapFrontierProjection } from '../apps/explorer-web/src/explorer-system-map-frontier-projection.js';

export interface FactNode {
  id: string;
  kind: 'region' | 'file';
  path: string;
  label: string;
  parentId: string | null;
  depth: number;
  children: string[];
  files: string[];
  workspacePackage?: WorkspacePackage;
}

export interface Facts {
  graph: ProjectGraph;
  structure: ProjectStructure;
  geography: ExplorerSystemMapGeography;
  nodes: Map<string, FactNode>;
  rootId: string;
}

export function buildFacts(analysis: AnalysisResult): Facts {
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  return factsFrom(graph, structure);
}

export function factsFrom(graph: ProjectGraph, structure: ProjectStructure): Facts {
  const geography = createExplorerSystemMapGeography(structure);
  const nodes = new Map<string, FactNode>();
  function visit(id: string, depth: number) {
    const region = geography.regionsById.get(id);
    if (!region) throw new Error(`Missing region: ${id}`);
    const children = [...region.childRegionIds, ...region.directFileIds];
    nodes.set(id, { id, kind: 'region', path: region.rootPath,
      label: region.rootPath === '.' ? 'System' : region.rootPath.split('/').at(-1) ?? region.rootPath,
      parentId: region.parentRegionId, depth, children, files: region.descendantFileIds,
      workspacePackage: region.workspacePackage });
    for (const child of region.childRegionIds) visit(child, depth + 1);
    for (const file of region.directFileIds) nodes.set(file, {
      id: file, kind: 'file', path: file, label: file.split('/').at(-1) ?? file,
      parentId: id, depth: depth + 1, children: [], files: [file],
    });
    children.sort((a, b) => node({ nodes }, a).path.localeCompare(node({ nodes }, b).path));
  }
  visit(geography.boundaryRegionId, 0);
  return { graph, structure, geography, nodes, rootId: geography.boundaryRegionId };
}

export function node(facts: Pick<Facts, 'nodes'>, id: string): FactNode {
  const result = facts.nodes.get(id);
  if (!result) throw new Error(`Unknown factual location: ${id}`);
  return result;
}

export function ancestors(facts: Facts, id: string): FactNode[] {
  const result: FactNode[] = [];
  let current: FactNode | undefined = node(facts, id);
  while (current) {
    result.unshift(current);
    current = current.parentId ? node(facts, current.parentId) : undefined;
  }
  return result;
}

export function usefulRoot(facts: Facts): string {
  let current = node(facts, facts.rootId);
  while (current.children.length === 1) {
    const child = node(facts, current.children[0] ?? '');
    if (child.kind === 'file' || child.workspacePackage) break;
    current = child;
  }
  return current.id;
}

export function partition(facts: Facts, split: (n: FactNode) => boolean): string[] {
  const ids: string[] = [];
  function visit(id: string) {
    const n = node(facts, id);
    if (n.children.length && split(n)) n.children.forEach(visit);
    else ids.push(id);
  }
  visit(facts.rootId);
  return ids.sort();
}

export function project(facts: Facts, ids: readonly string[]) {
  const frontier: ExplorerSystemMapLandmark[] = ids.map(id => node(facts, id).kind === 'file'
    ? { id, kind: 'file', fileId: id } : { id, kind: 'region', regionId: id });
  return createExplorerSystemMapFrontierProjection(facts.geography, facts.graph, frontier);
}

export function focusedPartition(facts: Facts, focusId: string): string[] {
  const path = new Set(ancestors(facts, focusId).map(n => n.id));
  return partition(facts, n => path.has(n.id));
}

export function description(n: FactNode): string {
  if (n.kind === 'file') return `File · direct in ${n.parentId?.replace(/^directory:/, '') ?? 'System'}`;
  return n.workspacePackage ? `Workspace package · ${n.workspacePackage.name ?? n.workspacePackage.id}` : 'Region';
}

export function neighbors(facts: Facts, selected: string, owners: ReadonlyMap<string, string>) {
  const files = new Set(node(facts, selected).files);
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  let within = 0;
  for (const edge of facts.graph.edges) {
    if (edge.dependencyKind !== 'internal') continue;
    const source = files.has(edge.sourceNodeId);
    const target = files.has(edge.targetNodeId);
    if (source && target) { within++; continue; }
    if (source) {
      const id = owners.get(edge.targetNodeId) ?? edge.targetNodeId;
      outgoing.set(id, (outgoing.get(id) ?? 0) + 1);
    }
    if (target) {
      const id = owners.get(edge.sourceNodeId) ?? edge.sourceNodeId;
      incoming.set(id, (incoming.get(id) ?? 0) + 1);
    }
  }
  return { outgoing, incoming, within };
}
