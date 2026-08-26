import type { AnalysisProjectStructure, AnalysisResult, WorkspacePackage } from '@bunker-code/contracts';

export type StructuralSource = 'analysis-target' | 'filesystem' | 'pnpm-workspace';

export interface AnalysisRootStructuralUnit {
  id: 'analysis-root:.';
  kind: 'analysis-root';
  rootPath: '.';
  source: 'analysis-target';
}

export interface DirectoryStructuralUnit {
  id: string;
  kind: 'directory';
  rootPath: string;
  source: 'filesystem';
}

export type StructuralUnit = AnalysisRootStructuralUnit | DirectoryStructuralUnit | WorkspacePackage;

export type StructuralChildReference =
  | { kind: 'structural-unit'; structuralUnitId: string }
  | { kind: 'file'; fileId: string };

export interface StructuralContainment {
  parentUnitId: string;
  child: StructuralChildReference;
  source: StructuralSource;
}

export type StructuralSourceReport =
  | { source: 'analysis-target'; status: 'reported' }
  | { source: 'filesystem'; status: 'subdivision-detected' | 'no-subdivision' }
  | { source: 'pnpm-workspace'; status: 'reported' | 'not-reported' };

export interface ProjectStructure {
  rootUnitId: string;
  units: StructuralUnit[];
  containments: StructuralContainment[];
  sourceReports: StructuralSourceReport[];
  packages: WorkspacePackage[];
  fileMemberships: AnalysisProjectStructure['fileMemberships'];
  /** File IDs without a valid workspace-package membership. */
  unassignedFileIds: string[];
}

interface ProjectStructureIndex {
  packageById: Map<string, WorkspacePackage>;
  packageIdByFileId: Map<string, string>;
  fileIdsByPackageId: Map<string, string[]>;
}

const structureIndexes = new WeakMap<ProjectStructure, ProjectStructureIndex>();

const ANALYSIS_ROOT_ID = 'analysis-root:.' as const;

function directoryId(rootPath: string): string {
  return `directory:${rootPath}`;
}

function normalizedPathSegments(
  relativePath: string,
  options: { allowRoot: boolean; allowOutside: boolean },
): string[] | undefined {
  if (relativePath === '..' || relativePath.startsWith('../')) {
    if (options.allowOutside) {
      return undefined;
    }

    throw new Error(`Invalid project structure path: "${relativePath}".`);
  }

  if (
    relativePath.length === 0
    || relativePath.startsWith('/')
    || /^[A-Za-z]:\//.test(relativePath)
    || relativePath.includes('\\')
  ) {
    throw new Error(`Invalid project structure path: "${relativePath}".`);
  }

  if (options.allowRoot && relativePath === '.') {
    return [];
  }

  const segments = relativePath.split('/');

  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`Invalid project structure path: "${relativePath}".`);
  }

  return segments;
}

function childReferenceId(child: StructuralChildReference): string {
  return child.kind === 'structural-unit' ? child.structuralUnitId : child.fileId;
}

function compareStructuralUnits(left: StructuralUnit, right: StructuralUnit): number {
  return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id);
}

function compareContainments(left: StructuralContainment, right: StructuralContainment): number {
  return left.source.localeCompare(right.source)
    || left.parentUnitId.localeCompare(right.parentUnitId)
    || left.child.kind.localeCompare(right.child.kind)
    || childReferenceId(left.child).localeCompare(childReferenceId(right.child));
}

function createDirectoryUnits(
  analysis: AnalysisResult,
  packages: readonly WorkspacePackage[],
): DirectoryStructuralUnit[] {
  const directoryPaths = new Set<string>();

  for (const file of analysis.files) {
    const segments = normalizedPathSegments(file.path, {
      allowRoot: false,
      allowOutside: true,
    });

    if (!segments) {
      continue;
    }

    for (let length = 1; length < segments.length; length += 1) {
      directoryPaths.add(segments.slice(0, length).join('/'));
    }
  }

  for (const workspacePackage of packages) {
    const segments = normalizedPathSegments(workspacePackage.rootPath, {
      allowRoot: true,
      allowOutside: false,
    });

    if (!segments) {
      throw new Error(`Invalid project structure path: "${workspacePackage.rootPath}".`);
    }

    for (let length = 1; length <= segments.length; length += 1) {
      directoryPaths.add(segments.slice(0, length).join('/'));
    }
  }

  return [...directoryPaths]
    .sort()
    .map((rootPath) => ({
      id: directoryId(rootPath),
      kind: 'directory' as const,
      rootPath,
      source: 'filesystem' as const,
    }));
}

function createAnalysisTargetContainments(analysis: AnalysisResult): StructuralContainment[] {
  return analysis.files.map((file) => ({
    parentUnitId: ANALYSIS_ROOT_ID,
    child: { kind: 'file' as const, fileId: file.id },
    source: 'analysis-target' as const,
  }));
}

function createFilesystemContainments(
  analysis: AnalysisResult,
  directoryUnits: readonly DirectoryStructuralUnit[],
): StructuralContainment[] {
  const containments: StructuralContainment[] = directoryUnits.map((directory) => {
    const segments = directory.rootPath.split('/');
    const parentPath = segments.slice(0, -1).join('/');

    return {
      parentUnitId: parentPath.length > 0 ? directoryId(parentPath) : ANALYSIS_ROOT_ID,
      child: { kind: 'structural-unit', structuralUnitId: directory.id },
      source: 'filesystem',
    };
  });

  for (const file of analysis.files) {
    const segments = normalizedPathSegments(file.path, {
      allowRoot: false,
      allowOutside: true,
    });

    if (!segments) {
      continue;
    }

    const parentPath = segments.slice(0, -1).join('/');
    containments.push({
      parentUnitId: parentPath.length > 0 ? directoryId(parentPath) : ANALYSIS_ROOT_ID,
      child: { kind: 'file', fileId: file.id },
      source: 'filesystem',
    });
  }

  return containments;
}

function structureIndex(structure: ProjectStructure): ProjectStructureIndex {
  const cachedIndex = structureIndexes.get(structure);

  if (cachedIndex) {
    return cachedIndex;
  }

  const packageById = new Map(structure.packages.map((workspacePackage) => [workspacePackage.id, workspacePackage]));
  const packageIdByFileId = new Map<string, string>();
  const fileIdsByPackageId = new Map<string, string[]>();

  for (const workspacePackage of structure.packages) {
    fileIdsByPackageId.set(workspacePackage.id, []);
  }

  for (const membership of structure.fileMemberships) {
    packageIdByFileId.set(membership.fileId, membership.workspacePackageId);
    const fileIds = fileIdsByPackageId.get(membership.workspacePackageId);

    if (fileIds) {
      fileIds.push(membership.fileId);
    }
  }

  for (const [packageId, fileIds] of fileIdsByPackageId) {
    fileIdsByPackageId.set(packageId, fileIds.sort());
  }

  const index = { packageById, packageIdByFileId, fileIdsByPackageId };
  structureIndexes.set(structure, index);
  return index;
}

/** Builds deterministic containment facts without changing the dependency graph. */
export function buildProjectStructure(analysis: AnalysisResult): ProjectStructure {
  const declaredStructure = analysis.structure;
  const fileIds = new Set(analysis.files.map((file) => file.id));
  const packages = [...(declaredStructure?.packages ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  const packageIds = new Set(packages.map((workspacePackage) => workspacePackage.id));
  const fileMemberships = [...(declaredStructure?.fileMemberships ?? [])]
    .filter((membership) => fileIds.has(membership.fileId) && packageIds.has(membership.workspacePackageId))
    .sort((left, right) => left.fileId.localeCompare(right.fileId));
  const assignedFileIds = new Set(fileMemberships.map((membership) => membership.fileId));
  const directoryUnits = createDirectoryUnits(analysis, packages);
  const analysisTargetContainments = createAnalysisTargetContainments(analysis);
  const filesystemContainments = createFilesystemContainments(analysis, directoryUnits);
  const pnpmContainments: StructuralContainment[] = [
    ...packages.map((workspacePackage) => ({
      parentUnitId: ANALYSIS_ROOT_ID,
      child: {
        kind: 'structural-unit' as const,
        structuralUnitId: workspacePackage.id,
      },
      source: 'pnpm-workspace' as const,
    })),
    ...fileMemberships.map((membership) => ({
      parentUnitId: membership.workspacePackageId,
      child: {
        kind: 'file' as const,
        fileId: membership.fileId,
      },
      source: 'pnpm-workspace' as const,
    })),
  ];
  const analysisRoot: AnalysisRootStructuralUnit = {
    id: ANALYSIS_ROOT_ID,
    kind: 'analysis-root',
    rootPath: '.',
    source: 'analysis-target',
  };
  const sourceReports = [
    { source: 'analysis-target', status: 'reported' },
    {
      source: 'filesystem',
      status: directoryUnits.length > 0 ? 'subdivision-detected' : 'no-subdivision',
    },
    {
      source: 'pnpm-workspace',
      status: declaredStructure ? 'reported' : 'not-reported',
    },
  ] satisfies StructuralSourceReport[];
  sourceReports.sort((left, right) => left.source.localeCompare(right.source));
  const unassignedFileIds = [...fileIds]
    .filter((fileId) => !assignedFileIds.has(fileId))
    .sort();
  const structure: ProjectStructure = {
    rootUnitId: ANALYSIS_ROOT_ID,
    units: [analysisRoot, ...directoryUnits, ...packages].sort(compareStructuralUnits),
    containments: [
      ...analysisTargetContainments,
      ...filesystemContainments,
      ...pnpmContainments,
    ].sort(compareContainments),
    sourceReports,
    packages,
    fileMemberships,
    unassignedFileIds,
  };
  return structure;
}

export function getWorkspacePackages(structure: ProjectStructure): WorkspacePackage[] {
  return [...structure.packages];
}

export function getWorkspacePackage(structure: ProjectStructure, packageId: string): WorkspacePackage | undefined {
  return structureIndex(structure).packageById.get(packageId);
}

export function getWorkspacePackageForFile(structure: ProjectStructure, fileId: string): WorkspacePackage | undefined {
  const packageId = structureIndex(structure).packageIdByFileId.get(fileId);
  return packageId ? getWorkspacePackage(structure, packageId) : undefined;
}

export function getFilesInWorkspacePackage(structure: ProjectStructure, packageId: string): string[] {
  return [...(structureIndex(structure).fileIdsByPackageId.get(packageId) ?? [])];
}
