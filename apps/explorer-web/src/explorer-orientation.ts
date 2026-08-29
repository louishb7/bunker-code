import type { ProjectGraph } from '@bunker-code/graph-engine';
import { fileNameFromPath } from './explorer-search.js';
import type { ExplorerLocation } from './explorer-state.js';
import {
  parentExplorerTerritory,
  type ExplorerTerritoryProjection,
} from './explorer-territory-projection.js';

export interface ExplorerNavigationDestination {
  territoryId: string | null;
  structuralPath: string[];
}

export type ExplorerNavigationTarget =
  | { kind: 'territory'; destination: ExplorerNavigationDestination }
  | { kind: 'files' };

export interface ExplorerTrailItem {
  id: string;
  label: string;
  target?: ExplorerNavigationTarget;
}

export interface ExplorerBackAction {
  label: string;
  target: ExplorerNavigationTarget;
  destination?: ExplorerNavigationDestination;
}

export interface ExplorerOrientation {
  projectLabel: string;
  scale: 'root' | 'territory' | 'file-connections';
  scaleLabel: 'System' | 'Territory' | 'File connections';
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
  const territory = location.currentTerritoryId === null
    ? territories.system
    : territories.territoriesById.get(location.currentTerritoryId);

  if (!territory) {
    throw new Error(`Territory not found: ${location.currentTerritoryId}`);
  }

  const territoryTrail = territoryAncestors(territories, territory.id).map((ancestor, index, all) => ({
    id: ancestor.id,
    label: index === 0 ? normalizedProjectLabel : ancestor.label,
    target: index < all.length - 1
      ? { kind: 'territory' as const, destination: { territoryId: ancestor.kind === 'system' ? null : ancestor.id, structuralPath: [...ancestor.structuralPath] } }
      : undefined,
  }));

  if (location.focusedFileId !== null) {
    return {
      projectLabel: normalizedProjectLabel,
      scale: 'file-connections',
      scaleLabel: 'File connections',
      focusedFileLabel: graphFileLabel(graph, location.focusedFileId),
      backAction: { label: 'Back to territory', target: { kind: 'files' } },
      trail: [...territoryTrail, { id: location.focusedFileId, label: graphFileLabel(graph, location.focusedFileId) }],
    };
  }

  if (territory.kind === 'system') {
    return { projectLabel: normalizedProjectLabel, scale: 'root', scaleLabel: 'System', trail: territoryTrail };
  }

  const parent = parentExplorerTerritory(territories, territory.id) ?? territories.system;
  const destination = { territoryId: parent.kind === 'system' ? null : parent.id, structuralPath: [...parent.structuralPath] };
  return {
    projectLabel: normalizedProjectLabel,
    scale: 'territory',
    scaleLabel: 'Territory',
    backAction: { label: `Back to ${parent.kind === 'system' ? 'system' : parent.label}`, target: { kind: 'territory', destination }, destination },
    trail: territoryTrail,
  };
}

function territoryAncestors(
  territories: ExplorerTerritoryProjection,
  territoryId: string,
) {
  const trail = [];
  let current = territories.territoriesById.get(territoryId) ?? territories.system;

  while (true) {
    trail.unshift(current);
    const parent = current.kind === 'system' ? null : parentExplorerTerritory(territories, current.id);
    if (!parent) {
      return trail;
    }
    current = parent;
  }
}

function graphFileLabel(graph: ProjectGraph, nodeId: string): string {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  return node?.kind === 'file' ? fileNameFromPath(node.path) : fileNameFromPath(nodeId);
}
