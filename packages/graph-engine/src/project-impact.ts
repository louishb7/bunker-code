import { detectCycles, getDependents } from './project-graph.js';
import type { FileGraphNode, ProjectGraph, ProjectGraphCycle, ProjectGraphNode } from './project-graph.js';

export interface ImpactedFile {
  node: FileGraphNode;
  depth: number;
  path: string[];
}

export interface ImpactCircularity {
  participatesInCycle: boolean;
  cycle?: ProjectGraphCycle;
}

export interface ImpactReport {
  target: FileGraphNode;
  directDependents: FileGraphNode[];
  affectedDependents: ImpactedFile[];
  totalAffected: number;
  maxDepth: number;
  circularity: ImpactCircularity;
}

interface PendingTraversal {
  node: FileGraphNode;
  depth: number;
  path: string[];
}

export function getTransitiveDependents(graph: ProjectGraph, targetNodeId: string): ImpactedFile[] {
  const fileNodesById = new Map(
    graph.nodes
      .filter((node): node is FileGraphNode => node.kind === 'file')
      .map((node) => [node.id, node] as const),
  );
  const target = fileNodesById.get(targetNodeId);

  if (!target) {
    throw new Error(`Impact target file not found in project graph: ${targetNodeId}`);
  }

  return transitiveDependents(graph, target, fileNodesById);
}

export function createImpactReport(graph: ProjectGraph, targetNodeId: string): ImpactReport {
  const fileNodesById = new Map(
    graph.nodes
      .filter((node): node is FileGraphNode => node.kind === 'file')
      .map((node) => [node.id, node] as const),
  );
  const target = fileNodesById.get(targetNodeId);

  if (!target) {
    throw new Error(`Impact target file not found in project graph: ${targetNodeId}`);
  }

  const affectedDependents = transitiveDependents(graph, target, fileNodesById);
  const directDependents = affectedDependents
    .filter((dependent) => dependent.depth === 1)
    .map((dependent) => dependent.node);
  const cycle = detectCycles(graph).find((candidate) => candidate.nodeIds.includes(target.id));

  return {
    target,
    directDependents,
    affectedDependents,
    totalAffected: affectedDependents.length,
    maxDepth: affectedDependents.reduce((maximum, dependent) => Math.max(maximum, dependent.depth), 0),
    circularity: cycle
      ? {
          participatesInCycle: true,
          cycle,
        }
      : {
          participatesInCycle: false,
        },
  };
}

function transitiveDependents(
  graph: ProjectGraph,
  target: FileGraphNode,
  fileNodesById: ReadonlyMap<string, FileGraphNode>,
): ImpactedFile[] {
  const affectedDependents: ImpactedFile[] = [];
  const discoveredNodeIds = new Set([target.id]);
  const pending: PendingTraversal[] = [];

  for (const dependentNode of dependentFileNodes(graph, target.id, fileNodesById)) {
    discoveredNodeIds.add(dependentNode.id);
    pending.push({
      node: dependentNode,
      depth: 1,
      path: [target.id, dependentNode.id],
    });
  }

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];

    if (!current) {
      continue;
    }

    affectedDependents.push({
      node: current.node,
      depth: current.depth,
      path: current.path,
    });

    for (const dependentNode of dependentFileNodes(graph, current.node.id, fileNodesById)) {
      if (discoveredNodeIds.has(dependentNode.id)) {
        continue;
      }

      discoveredNodeIds.add(dependentNode.id);
      pending.push({
        node: dependentNode,
        depth: current.depth + 1,
        path: [...current.path, dependentNode.id],
      });
    }
  }

  return affectedDependents;
}

function dependentFileNodes(
  graph: ProjectGraph,
  nodeId: string,
  fileNodesById: ReadonlyMap<string, FileGraphNode>,
): FileGraphNode[] {
  const nodes = new Map<string, FileGraphNode>();

  for (const edge of getDependents(graph, nodeId)) {
    const node = fileNodesById.get(edge.sourceNodeId);

    if (node && node.id !== nodeId) {
      nodes.set(node.id, node);
    }
  }

  return [...nodes.values()].sort(compareFileNodes);
}

function compareFileNodes(left: ProjectGraphNode, right: ProjectGraphNode): number {
  return left.id.localeCompare(right.id);
}
