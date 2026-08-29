import type { Responsibility, ResponsibilityAnalysisResult, ResponsibilityFinding } from '@bunker-code/contracts';
import {
  chooseInitialExplorerPerspective,
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
  perspective: ExplorerPerspective;
  location: ExplorerLocation;
  selectedResponsibility: Responsibility | null;
  selectedFindingId: string | null;
}

export function createInitialExplorerViewState(
  responsibilities: ResponsibilityAnalysisResult,
  territories: ExplorerTerritoryProjection,
): ExplorerViewState {
  return {
    perspective: chooseInitialExplorerPerspective(responsibilities),
    location: createInitialExplorerLocation(territories),
    selectedResponsibility: null,
    selectedFindingId: null,
  };
}

export function switchExplorerPerspective(
  state: ExplorerViewState,
  perspective: ExplorerPerspective,
): ExplorerViewState {
  return { ...state, perspective };
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
    perspective: 'territory',
    location: navigateToDestination(state.location, {
      territoryId: territory.kind === 'system' ? null : territory.id,
      structuralPath: [...territory.structuralPath],
      itemId: finding.subject.fileId,
    }),
  };
}
