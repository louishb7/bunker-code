import type { WorkspacePackage } from '@bunker-code/contracts';
import type {
  DirectoryStructuralUnit,
  ProjectStructure,
  StructuralContainment,
} from '@bunker-code/graph-engine';

export interface ExplorerSystemMapRegion {
  id: string;
  rootPath: string;
  parentRegionId: string | null;
  childRegionIds: string[];
  directFileIds: string[];
  descendantFileIds: string[];
  directoryUnit?: DirectoryStructuralUnit;
  workspacePackage?: WorkspacePackage;
}

export type ExplorerSystemMapLandmark =
  | { id: string; kind: 'region'; regionId: string }
  | { id: string; kind: 'file'; fileId: string };

export interface ExplorerSystemMapGeography {
  boundaryRegionId: string;
  regionsById: ReadonlyMap<string, ExplorerSystemMapRegion>;
  initialFrontier: ExplorerSystemMapLandmark[];
}

export function createExplorerSystemMapFrontier(
  geography: ExplorerSystemMapGeography,
  refinedRegionIds: ReadonlySet<string>,
): ExplorerSystemMapLandmark[] {
  return refineLandmarks(geography.initialFrontier, geography, refinedRegionIds);
}

export function refineExplorerSystemMapRegion(
  geography: ExplorerSystemMapGeography,
  refinedRegionIds: ReadonlySet<string>,
  regionId: string,
): Set<string> {
  if (!geography.regionsById.has(regionId)) throw new Error(`System Map region not found: ${regionId}`);
  return new Set([...refinedRegionIds, regionId].sort());
}

export function collapseExplorerSystemMapRegion(
  geography: ExplorerSystemMapGeography,
  refinedRegionIds: ReadonlySet<string>,
  regionId: string,
): Set<string> {
  const next = new Set<string>();
  for (const candidate of refinedRegionIds) {
    if (candidate === regionId || isDescendantRegion(geography, candidate, regionId)) continue;
    next.add(candidate);
  }
  return new Set([...next].sort());
}

interface RegionDraft {
  id: string;
  rootPath: string;
  parentRegionId: string | null;
  childRegionIds: Set<string>;
  directFileIds: Set<string>;
  directoryUnit?: DirectoryStructuralUnit;
  workspacePackage?: WorkspacePackage;
}

export function createExplorerSystemMapGeography(
  structure: ProjectStructure,
): ExplorerSystemMapGeography {
  const rootUnit = structure.units.find((unit) => unit.id === structure.rootUnitId);
  if (!rootUnit || rootUnit.kind !== 'analysis-root') {
    throw new Error(`Analysis root structural unit not found: ${structure.rootUnitId}`);
  }

  const directoriesById = new Map(
    structure.units
      .filter((unit): unit is DirectoryStructuralUnit => unit.kind === 'directory')
      .sort(compareStructuralUnits)
      .map((directory) => [directory.id, directory] as const),
  );
  const packagesByRootPath = new Map<string, WorkspacePackage>();
  for (const workspacePackage of structure.units
    .filter((unit): unit is WorkspacePackage => unit.kind === 'workspace-package')
    .sort(compareStructuralUnits)) {
    if (packagesByRootPath.has(workspacePackage.rootPath)) {
      throw new Error(`Multiple workspace packages share one structural location: ${workspacePackage.rootPath}`);
    }
    packagesByRootPath.set(workspacePackage.rootPath, workspacePackage);
  }
  const draftsById = new Map<string, RegionDraft>();
  const rootDraft: RegionDraft = {
    id: rootUnit.id,
    rootPath: rootUnit.rootPath,
    parentRegionId: null,
    childRegionIds: new Set(),
    directFileIds: new Set(),
    workspacePackage: packagesByRootPath.get(rootUnit.rootPath),
  };
  draftsById.set(rootDraft.id, rootDraft);

  for (const directory of directoriesById.values()) {
    draftsById.set(directory.id, {
      id: directory.id,
      rootPath: directory.rootPath,
      parentRegionId: null,
      childRegionIds: new Set(),
      directFileIds: new Set(),
      directoryUnit: directory,
      workspacePackage: packagesByRootPath.get(directory.rootPath),
    });
  }

  const parentRegionIdByFileId = new Map<string, string>();
  for (const containment of [...structure.containments].sort(compareContainments)) {
    if (containment.source !== 'filesystem') continue;
    const parent = draftsById.get(containment.parentUnitId);
    if (!parent) continue;

    if (containment.child.kind === 'file') {
      const existingParentId = parentRegionIdByFileId.get(containment.child.fileId);
      if (existingParentId && existingParentId !== parent.id) {
        throw new Error(`Analyzed file has multiple filesystem parents: ${containment.child.fileId}`);
      }
      parentRegionIdByFileId.set(containment.child.fileId, parent.id);
      parent.directFileIds.add(containment.child.fileId);
      continue;
    }

    const child = draftsById.get(containment.child.structuralUnitId);
    if (!child) continue;
    if (child.parentRegionId !== null && child.parentRegionId !== parent.id) {
      throw new Error(`Structural region has multiple filesystem parents: ${child.id}`);
    }
    child.parentRegionId = parent.id;
    parent.childRegionIds.add(child.id);
  }

  const regionsById = new Map<string, ExplorerSystemMapRegion>();
  const visiting = new Set<string>();

  function buildRegion(regionId: string): ExplorerSystemMapRegion {
    const existing = regionsById.get(regionId);
    if (existing) return existing;
    const draft = draftsById.get(regionId);
    if (!draft) throw new Error(`Structural region not found: ${regionId}`);
    if (visiting.has(regionId)) throw new Error(`Filesystem containment cycle found at: ${regionId}`);
    visiting.add(regionId);

    const childRegionIds = [...draft.childRegionIds].sort(compareRegionIds(draftsById));
    const directFileIds = [...draft.directFileIds].sort();
    const descendantFileIds = [
      ...directFileIds,
      ...childRegionIds.flatMap((childRegionId) => buildRegion(childRegionId).descendantFileIds),
    ].sort();
    const region: ExplorerSystemMapRegion = {
      id: draft.id,
      rootPath: draft.rootPath,
      parentRegionId: draft.parentRegionId,
      childRegionIds,
      directFileIds,
      descendantFileIds,
      directoryUnit: draft.directoryUnit,
      workspacePackage: draft.workspacePackage,
    };
    visiting.delete(regionId);
    regionsById.set(regionId, region);
    return region;
  }

  const boundary = buildRegion(rootDraft.id);
  for (const regionId of [...draftsById.keys()].sort(compareRegionIds(draftsById))) {
    buildRegion(regionId);
  }
  const orderedRegionsById = new Map(
    [...regionsById.entries()].sort(([, left], [, right]) => (
      left.rootPath.localeCompare(right.rootPath) || left.id.localeCompare(right.id)
    )),
  );

  return {
    boundaryRegionId: boundary.id,
    regionsById: orderedRegionsById,
    initialFrontier: createInitialFrontier(boundary, orderedRegionsById),
  };
}

function createInitialFrontier(
  boundary: ExplorerSystemMapRegion,
  regionsById: ReadonlyMap<string, ExplorerSystemMapRegion>,
): ExplorerSystemMapLandmark[] {
  let frontierParent = boundary;

  while (frontierParent.directFileIds.length === 0 && frontierParent.childRegionIds.length === 1) {
    const childId = frontierParent.childRegionIds[0];
    if (!childId) break;
    const child = regionsById.get(childId);
    if (!child) throw new Error(`Structural region not found: ${childId}`);
    if (child.workspacePackage) break;
    frontierParent = child;
  }

  return [
    ...frontierParent.childRegionIds.map((regionId) => ({
      id: regionId,
      kind: 'region' as const,
      regionId,
    })),
    ...frontierParent.directFileIds.map((fileId) => ({
      id: fileId,
      kind: 'file' as const,
      fileId,
    })),
  ].sort(compareLandmarks);
}

function refineLandmarks(
  landmarks: readonly ExplorerSystemMapLandmark[],
  geography: ExplorerSystemMapGeography,
  refinedRegionIds: ReadonlySet<string>,
): ExplorerSystemMapLandmark[] {
  return landmarks.flatMap((landmark) => {
    if (landmark.kind !== 'region' || !refinedRegionIds.has(landmark.regionId)) return [landmark];
    const region = geography.regionsById.get(landmark.regionId);
    if (!region) throw new Error(`System Map region not found: ${landmark.regionId}`);
    return refineLandmarks(landmarksInsideOpenedRegion(region, geography.regionsById), geography, refinedRegionIds);
  }).sort(compareLandmarks);
}

function landmarksInsideOpenedRegion(
  openedRegion: ExplorerSystemMapRegion,
  regionsById: ReadonlyMap<string, ExplorerSystemMapRegion>,
): ExplorerSystemMapLandmark[] {
  let parent = openedRegion;
  while (parent.directFileIds.length === 0 && parent.childRegionIds.length === 1) {
    const childId = parent.childRegionIds[0];
    if (!childId) break;
    const child = regionsById.get(childId);
    if (!child) throw new Error(`System Map region not found: ${childId}`);
    if (child.workspacePackage) break;
    parent = child;
  }
  return [
    ...parent.childRegionIds.map((regionId) => ({ id: regionId, kind: 'region' as const, regionId })),
    ...parent.directFileIds.map((fileId) => ({ id: fileId, kind: 'file' as const, fileId })),
  ].sort(compareLandmarks);
}

function isDescendantRegion(
  geography: ExplorerSystemMapGeography,
  regionId: string,
  ancestorId: string,
): boolean {
  let current = geography.regionsById.get(regionId);
  while (current?.parentRegionId) {
    if (current.parentRegionId === ancestorId) return true;
    current = geography.regionsById.get(current.parentRegionId);
  }
  return false;
}

function compareStructuralUnits(
  left: DirectoryStructuralUnit | WorkspacePackage,
  right: DirectoryStructuralUnit | WorkspacePackage,
): number {
  return left.rootPath.localeCompare(right.rootPath) || left.id.localeCompare(right.id);
}

function compareContainments(left: StructuralContainment, right: StructuralContainment): number {
  return left.parentUnitId.localeCompare(right.parentUnitId)
    || childId(left).localeCompare(childId(right));
}

function childId(containment: StructuralContainment): string {
  return containment.child.kind === 'file'
    ? containment.child.fileId
    : containment.child.structuralUnitId;
}

function compareRegionIds(draftsById: ReadonlyMap<string, RegionDraft>) {
  return (leftId: string, rightId: string): number => {
    const left = draftsById.get(leftId);
    const right = draftsById.get(rightId);
    return (left?.rootPath ?? leftId).localeCompare(right?.rootPath ?? rightId)
      || leftId.localeCompare(rightId);
  };
}

function compareLandmarks(left: ExplorerSystemMapLandmark, right: ExplorerSystemMapLandmark): number {
  return left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind);
}
