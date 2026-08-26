import type { ProjectGraph } from '@bunker-code/graph-engine';
import { fileNameFromPath } from './explorer-search.js';
import type { ExplorerLocation } from './explorer-state.js';
import type { ExplorerTerritoryProjection } from './explorer-territory-projection.js';

export type ExplorerNavigationTarget = 'system' | 'files';

export interface ExplorerTrailItem {
  id: string;
  label: string;
  target?: ExplorerNavigationTarget;
}

export interface ExplorerBackAction {
  label: string;
  target: ExplorerNavigationTarget;
}

export interface ExplorerOrientation {
  projectLabel: string;
  scale: 'system-map' | 'part-files' | 'file-connections';
  scaleLabel: 'System map' | 'Territory files' | 'File connections';
  trail: ExplorerTrailItem[];
  backAction?: ExplorerBackAction;
  focusedFileLabel?: string;
}

export function createExplorerOrientation(
  location: ExplorerLocation,
  territories: ExplorerTerritoryProjection,
  projectLabel: string,
  graph: ProjectGraph,
): ExplorerOrientation {
  const normalizedProjectLabel = projectLabel.trim() || 'Analyzed project';
  const territory = location.currentTerritoryId
    ? territories.territoriesById.get(location.currentTerritoryId)
    : territories.system;
  const trail: ExplorerTrailItem[] = [{
    id: territories.system.id,
    label: normalizedProjectLabel,
    target: location.currentTerritoryId ? 'system' : undefined,
  }];

  if (territory && territory.kind !== 'system') {
    trail.push({ id: territory.id, label: territory.label });
  }

  if (location.focusedFileId) {
    trail.push({ id: location.focusedFileId, label: graphFileLabel(graph, location.focusedFileId) });
  }

  if (location.focusedFileId) {
    return {
      projectLabel: normalizedProjectLabel,
      scale: 'file-connections',
      scaleLabel: 'File connections',
      focusedFileLabel: graphFileLabel(graph, location.focusedFileId),
      backAction: { label: 'Back to territory files', target: 'files' },
      trail,
    };
  }

  return {
    projectLabel: normalizedProjectLabel,
    scale: location.currentTerritoryId ? 'part-files' : 'system-map',
    scaleLabel: location.currentTerritoryId ? 'Territory files' : 'System map',
    trail,
  };
}

function graphFileLabel(graph: ProjectGraph, nodeId: string): string {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  return node?.kind === 'file' ? fileNameFromPath(node.path) : fileNameFromPath(nodeId);
}
