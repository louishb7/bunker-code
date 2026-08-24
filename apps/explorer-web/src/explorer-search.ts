import type { FileGraphNode, ProjectGraph } from '@bunker-code/graph-engine';

export interface ExplorerSearchResult {
  nodeId: string;
  fileName: string;
  path: string;
}

export function searchExplorerFiles(
  graph: ProjectGraph,
  query: string,
  allowedNodeIds?: ReadonlySet<string>,
): ExplorerSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return graph.nodes
    .filter((node): node is FileGraphNode => node.kind === 'file' && (!allowedNodeIds || allowedNodeIds.has(node.id)))
    .map((node) => ({ nodeId: node.id, fileName: fileNameFromPath(node.path), path: node.path }))
    .filter((node) => (
      node.fileName.toLocaleLowerCase().includes(normalizedQuery)
      || node.path.toLocaleLowerCase().includes(normalizedQuery)
    ));
}

export function fileNameFromPath(path: string): string {
  return path.split('/').at(-1) ?? path;
}
