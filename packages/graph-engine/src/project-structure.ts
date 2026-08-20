import type { AnalysisProjectStructure, AnalysisResult, WorkspacePackage } from '@bunker-code/contracts';

export interface ProjectStructure {
  packages: WorkspacePackage[];
  fileMemberships: AnalysisProjectStructure['fileMemberships'];
  unassignedFileIds: string[];
}

interface ProjectStructureIndex {
  packageById: Map<string, WorkspacePackage>;
  packageIdByFileId: Map<string, string>;
  fileIdsByPackageId: Map<string, string[]>;
}

const structureIndexes = new WeakMap<ProjectStructure, ProjectStructureIndex>();

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
  const structure: ProjectStructure = {
    packages,
    fileMemberships,
    unassignedFileIds: [...fileIds].filter((fileId) => !assignedFileIds.has(fileId)).sort(),
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
