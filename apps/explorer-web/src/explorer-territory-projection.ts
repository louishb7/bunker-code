import type { WorkspacePackage, WorkspacePackageEvidence } from '@bunker-code/contracts';
import type {
  DirectoryStructuralUnit,
  FileGraphNode,
  ProjectStructure,
  StructuralContainment,
} from '@bunker-code/graph-engine';

export const PREVIEW_LIMIT_SYSTEM = 4;

export type TerritoryKind = 'directory' | 'workspace-package';

export interface ExplorerTerritory {
  id: string;
  kind: 'system' | TerritoryKind;
  structuralPath: string[];
  normalizedStructuralPath: string;
  label: string;
  isDrillable: boolean;
  analyzedFileCount: number;
  directChildTerritoryCount: number;
  previewItems: TerritoryPreviewItem[];
  omittedPreviewItemCount: number;
  evidence?: readonly WorkspacePackageEvidence[];
}

export type ExplorerTerritoryChild =
  | {
    kind: 'territory';
    territoryId: string;
    structuralPath: string[];
    label: string;
    isDrillable: boolean;
  }
  | {
    kind: 'file';
    fileId: string;
    structuralPath: string[];
    label: string;
  };

export type TerritoryPreviewItem = ExplorerTerritoryChild;

export interface ExplorerTerritoryProjection {
  system: ExplorerTerritory;
  territoriesById: ReadonlyMap<string, ExplorerTerritory>;
  childrenByTerritoryId: ReadonlyMap<string, ExplorerTerritoryChild[]>;
  parentTerritoryIdById: ReadonlyMap<string, string | null>;
}

interface RawDirectoryChildren {
  directoryRootPaths: string[];
  fileIds: string[];
}

interface TerritoryDraft {
  id: string;
  kind: 'system' | TerritoryKind;
  rootPath: string;
  structuralPath: string[];
  label: string;
}

const SYSTEM_ID = 'analysis-root:.';

export function createExplorerTerritoryProjection(
  structure: ProjectStructure,
  files: ReadonlyArray<Pick<FileGraphNode, 'id' | 'path'>>,
): ExplorerTerritoryProjection {
  const filesById = new Map(files.map((file) => [file.id, file] as const));
  const directoriesById = new Map(
    structure.units
      .filter((unit): unit is DirectoryStructuralUnit => unit.kind === 'directory')
      .map((directory) => [directory.id, directory] as const),
  );
  const packagesByRootPath = new Map(
    structure.units
      .filter((unit): unit is WorkspacePackage => unit.kind === 'workspace-package' && unit.rootPath !== '.')
      .map((workspacePackage) => [workspacePackage.rootPath, workspacePackage] as const),
  );
  const rawChildrenByRootPath = createRawChildren(structure.containments, directoriesById, filesById);
  const territoriesById = new Map<string, ExplorerTerritory>();
  const childrenByTerritoryId = new Map<string, ExplorerTerritoryChild[]>();
  const parentTerritoryIdById = new Map<string, string | null>();

  function draftForRootPath(rootPath: string): TerritoryDraft {
    if (rootPath === '.') {
      return {
        id: SYSTEM_ID,
        kind: 'system',
        rootPath,
        structuralPath: ['.'],
        label: 'System',
      };
    }

    const workspacePackage = packagesByRootPath.get(rootPath);
    if (workspacePackage) {
      return {
        id: workspacePackage.id,
        kind: 'workspace-package',
        rootPath,
        structuralPath: structuralPathFor(rootPath),
        label: workspacePackage.name ?? pathLabel(rootPath),
      };
    }

    const directory = [...directoriesById.values()].find((candidate) => candidate.rootPath === rootPath);
    if (!directory) {
      throw new Error(`Directory structural unit not found for projected root path: ${rootPath}`);
    }

    return {
      id: directory.id,
      kind: 'directory',
      rootPath,
      structuralPath: structuralPathFor(rootPath),
      label: pathLabel(rootPath),
    };
  }

  function isTransparentDirectory(rootPath: string): boolean {
    if (rootPath === '.' || packagesByRootPath.has(rootPath)) {
      return false;
    }

    const children = rawChildrenByRootPath.get(rootPath) ?? emptyRawChildren();
    return children.directoryRootPaths.length === 1 && children.fileIds.length === 0;
  }

  function resolveVisibleDirectory(rootPath: string): string {
    let currentRootPath = rootPath;

    while (isTransparentDirectory(currentRootPath)) {
      const childRootPath = (rawChildrenByRootPath.get(currentRootPath) ?? emptyRawChildren()).directoryRootPaths[0];

      if (!childRootPath) {
        break;
      }

      currentRootPath = childRootPath;
    }

    return currentRootPath;
  }

  function visibleDirectoryRootPaths(rootPath: string): string[] {
    const resolvedRootPath = resolveVisibleDirectory(rootPath);
    const wasCompressed = resolvedRootPath !== rootPath;
    const resolvedChildren = rawChildrenByRootPath.get(resolvedRootPath) ?? emptyRawChildren();

    if (wasCompressed && resolvedChildren.fileIds.length === 0 && resolvedChildren.directoryRootPaths.length > 1) {
      return resolvedChildren.directoryRootPaths.flatMap((childRootPath) => visibleDirectoryRootPaths(childRootPath));
    }

    return [resolvedRootPath];
  }

  function buildTerritory(rootPath: string, parentTerritoryId: string | null): ExplorerTerritory {
    const resolvedRootPath = rootPath === '.' ? '.' : resolveVisibleDirectory(rootPath);
    const draft = draftForRootPath(resolvedRootPath);
    const existing = territoriesById.get(draft.id);

    if (existing) {
      if (!parentTerritoryIdById.has(existing.id)) {
        parentTerritoryIdById.set(existing.id, parentTerritoryId);
      }
      return existing;
    }

    const rawChildren = rawChildrenByRootPath.get(resolvedRootPath) ?? emptyRawChildren();
    const territoryChildren = rawChildren.directoryRootPaths.flatMap((childRootPath) => (
      visibleDirectoryRootPaths(childRootPath).map((visibleRootPath) => {
        const child = buildTerritory(visibleRootPath, draft.id);
        return {
          kind: 'territory' as const,
          territoryId: child.id,
          structuralPath: child.structuralPath,
          label: child.label,
          isDrillable: child.isDrillable,
        };
      })
    ));
    const fileChildren = rawChildren.fileIds.map((fileId) => {
      const file = filesById.get(fileId);

      if (!file) {
        throw new Error(`Analyzed file not found for structural containment: ${fileId}`);
      }

      return {
        kind: 'file' as const,
        fileId: file.id,
        structuralPath: structuralPathFor(file.path),
        label: pathLabel(file.path),
      };
    });
    const children = [...territoryChildren, ...fileChildren].sort(compareChildren);
    const territory: ExplorerTerritory = {
      id: draft.id,
      kind: draft.kind,
      structuralPath: draft.structuralPath,
      normalizedStructuralPath: normalizedStructuralPath(draft.structuralPath),
      label: draft.label,
      isDrillable: children.length > 0,
      analyzedFileCount: analyzedFileCount(files, draft.rootPath),
      directChildTerritoryCount: territoryChildren.length,
      previewItems: children.slice(0, PREVIEW_LIMIT_SYSTEM),
      omittedPreviewItemCount: Math.max(0, children.length - PREVIEW_LIMIT_SYSTEM),
      evidence: draft.kind === 'workspace-package'
        ? packagesByRootPath.get(draft.rootPath)?.evidence
        : undefined,
    };

    territoriesById.set(draft.id, territory);
    childrenByTerritoryId.set(draft.id, children);
    parentTerritoryIdById.set(draft.id, parentTerritoryId);
    return territory;
  }

  const system = buildTerritory('.', null);
  return { system, territoriesById, childrenByTerritoryId, parentTerritoryIdById };
}

export function parentExplorerTerritory(
  projection: ExplorerTerritoryProjection,
  territoryId: string,
): ExplorerTerritory | null {
  const parentId = projection.parentTerritoryIdById.get(territoryId);

  if (parentId === undefined) {
    throw new Error(`Territory not found: ${territoryId}`);
  }

  return parentId === null ? null : projection.territoriesById.get(parentId) ?? null;
}

export function orderedTerritoryChildren(
  projection: ExplorerTerritoryProjection,
  territoryId: string | null,
): ExplorerTerritoryChild[] {
  return [...(projection.childrenByTerritoryId.get(territoryId ?? projection.system.id) ?? [])];
}

function createRawChildren(
  containments: readonly StructuralContainment[],
  directoriesById: ReadonlyMap<string, DirectoryStructuralUnit>,
  filesById: ReadonlyMap<string, Pick<FileGraphNode, 'id' | 'path'>>,
): ReadonlyMap<string, RawDirectoryChildren> {
  const childrenByRootPath = new Map<string, RawDirectoryChildren>();

  for (const containment of containments) {
    if (containment.source !== 'filesystem') {
      continue;
    }

    const parentRootPath = containment.parentUnitId === SYSTEM_ID
      ? '.'
      : directoriesById.get(containment.parentUnitId)?.rootPath;

    if (!parentRootPath) {
      continue;
    }

    const children = childrenByRootPath.get(parentRootPath) ?? emptyRawChildren();

    if (containment.child.kind === 'structural-unit') {
      const directory = directoriesById.get(containment.child.structuralUnitId);
      if (directory) {
        children.directoryRootPaths.push(directory.rootPath);
      }
    } else if (filesById.has(containment.child.fileId)) {
      children.fileIds.push(containment.child.fileId);
    }

    childrenByRootPath.set(parentRootPath, children);
  }

  for (const children of childrenByRootPath.values()) {
    children.directoryRootPaths.sort();
    children.fileIds.sort();
  }

  return childrenByRootPath;
}

function emptyRawChildren(): RawDirectoryChildren {
  return { directoryRootPaths: [], fileIds: [] };
}

function structuralPathFor(path: string): string[] {
  return path === '.' ? ['.'] : ['.', ...path.split('/')];
}

function normalizedStructuralPath(structuralPath: readonly string[]): string {
  return structuralPath.join('/');
}

function pathLabel(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function analyzedFileCount(files: ReadonlyArray<Pick<FileGraphNode, 'id' | 'path'>>, rootPath: string): number {
  if (rootPath === '.') {
    return files.length;
  }

  return files.filter((file) => file.path.startsWith(`${rootPath}/`)).length;
}

function compareChildren(left: ExplorerTerritoryChild, right: ExplorerTerritoryChild): number {
  return normalizedStructuralPath(left.structuralPath).localeCompare(normalizedStructuralPath(right.structuralPath))
    || childStableId(left).localeCompare(childStableId(right));
}

function childStableId(child: ExplorerTerritoryChild): string {
  return child.kind === 'territory' ? child.territoryId : child.fileId;
}
