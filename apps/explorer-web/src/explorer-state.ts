import type { ExplorerTerritoryProjection } from './explorer-territory-projection.js';

export interface ExplorerLocation {
  structuralPath: string[];
  currentTerritoryId: string | null;
  selectedItemId: string | null;
  focusedFileId: string | null;
  expandedItemIds: ReadonlySet<string>;
}

export interface ExplorerDestination {
  territoryId: string | null;
  structuralPath: string[];
  itemId: string;
  focusFileId?: string;
}

export function createInitialExplorerLocation(projection: ExplorerTerritoryProjection): ExplorerLocation {
  return {
    structuralPath: [...projection.system.structuralPath],
    currentTerritoryId: null,
    selectedItemId: null,
    focusedFileId: null,
    expandedItemIds: new Set(),
  };
}

export function navigateToTerritory(
  location: ExplorerLocation,
  territoryId: string,
  structuralPath: string[],
): ExplorerLocation {
  return navigateToStructuralPath(location, structuralPath, territoryId);
}

export function navigateToStructuralPath(
  location: ExplorerLocation,
  structuralPath: string[],
  territoryId: string | null,
): ExplorerLocation {
  const nextPath = [...structuralPath];

  if (sameStructuralPath(location.structuralPath, nextPath)) {
    return { ...location, currentTerritoryId: territoryId, structuralPath: nextPath };
  }

  return {
    structuralPath: nextPath,
    currentTerritoryId: territoryId,
    selectedItemId: null,
    focusedFileId: null,
    expandedItemIds: new Set(),
  };
}

export function navigateToDestination(location: ExplorerLocation, destination: ExplorerDestination): ExplorerLocation {
  const navigated = navigateToStructuralPath(location, destination.structuralPath, destination.territoryId);
  return {
    ...navigated,
    selectedItemId: destination.itemId,
    focusedFileId: destination.focusFileId ?? null,
    expandedItemIds: destination.focusFileId ? new Set() : navigated.expandedItemIds,
  };
}

export function selectExplorerItem(location: ExplorerLocation, itemId: string | null): ExplorerLocation {
  return { ...location, selectedItemId: itemId };
}

export function focusExplorerFile(location: ExplorerLocation, fileId: string): ExplorerLocation {
  return {
    ...location,
    selectedItemId: fileId,
    focusedFileId: fileId,
    expandedItemIds: new Set(),
  };
}

export function expandExplorerItem(location: ExplorerLocation, itemId: string): ExplorerLocation {
  return { ...location, expandedItemIds: new Set([...location.expandedItemIds, itemId]) };
}

function sameStructuralPath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
