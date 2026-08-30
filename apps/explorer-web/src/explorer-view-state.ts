import type { Responsibility, ResponsibilityFinding } from '@bunker-code/contracts';
import {
  resolveOwningTerritory,
  type ExplorerPerspective,
} from './explorer-responsibility-projection.js';
import {
  createInitialExplorerLocation,
  navigateToDestination,
  type ExplorerLocation,
} from './explorer-state.js';
import type { ExplorerTerritoryProjection } from './explorer-territory-projection.js';

export interface ExplorerViewState {
  surface: ExplorerSurface;
  location: ExplorerLocation;
  selectedResponsibility: Responsibility | null;
  selectedFindingId: string | null;
}

export type ExplorerSurface = 'overview' | ExplorerPerspective;

export function createInitialExplorerViewState(
  territories: ExplorerTerritoryProjection,
): ExplorerViewState {
  return {
    surface: 'overview',
    location: createInitialExplorerLocation(territories),
    selectedResponsibility: null,
    selectedFindingId: null,
  };
}

export function switchExplorerSurface(
  state: ExplorerViewState,
  surface: ExplorerSurface,
): ExplorerViewState {
  return { ...state, surface };
}

export function selectExplorerResponsibility(
  state: ExplorerViewState,
  responsibility: Responsibility,
): ExplorerViewState {
  return { ...state, selectedResponsibility: responsibility, selectedFindingId: null };
}

export function selectExplorerResponsibilityFinding(
  state: ExplorerViewState,
  responsibility: Responsibility,
  findingId: string,
): ExplorerViewState {
  return { ...state, selectedResponsibility: responsibility, selectedFindingId: findingId };
}

export function clearExplorerResponsibilitySelection(state: ExplorerViewState): ExplorerViewState {
  return { ...state, selectedResponsibility: null, selectedFindingId: null };
}

export function locateResponsibilityFinding(
  state: ExplorerViewState,
  finding: ResponsibilityFinding,
  territories: ExplorerTerritoryProjection,
): ExplorerViewState {
  const territory = resolveOwningTerritory(finding.subject.fileId, territories);

  return {
    ...state,
    surface: 'territory',
    location: navigateToDestination(state.location, {
      territoryId: territory.kind === 'system' ? null : territory.id,
      structuralPath: [...territory.structuralPath],
      itemId: finding.subject.fileId,
    }),
  };
}
