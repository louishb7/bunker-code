import type { PackageDependency, ProjectGraphEdge } from '@bunker-code/graph-engine';
import type { WorkspacePackage } from '@bunker-code/contracts';
import type { ExplorerWorkspacePackageProjectionNode } from './explorer-projection.js';

export interface PackageExplorationRelation {
  id: string;
  relatedLabel: string;
  sourceLabel: string;
  targetLabel: string;
  fileDependencies: ProjectGraphEdge[];
}

export interface PackageExploration {
  presentationLabel: string;
  technicalIdentity: string;
  location: string;
  filesystemGroup: string;
  fileCount: number;
  canOpenFiles: boolean;
  zeroFileExplanation?: string;
  isolatedExplanation?: string;
  uses: PackageExplorationRelation[];
  usedBy: PackageExplorationRelation[];
  evidence: WorkspacePackage['evidence'];
}

export function createPackageExploration(
  part: ExplorerWorkspacePackageProjectionNode,
  systemParts: ExplorerWorkspacePackageProjectionNode[],
  packageDependencies: PackageDependency[],
): PackageExploration {
  const labels = new Map(systemParts.map((systemPart) => [systemPart.id, systemPart.presentationLabel] as const));
  const uses = packageDependencies
    .filter((dependency) => dependency.sourcePackageId === part.id)
    .map((dependency) => packageExplorationRelation(dependency, dependency.targetPackageId, labels));
  const usedBy = packageDependencies
    .filter((dependency) => dependency.targetPackageId === part.id)
    .map((dependency) => packageExplorationRelation(dependency, dependency.sourcePackageId, labels));

  return {
    presentationLabel: part.presentationLabel,
    technicalIdentity: part.technicalLabel,
    location: part.workspacePackage.rootPath,
    filesystemGroup: part.filesystemGroup,
    fileCount: part.fileCount,
    canOpenFiles: part.fileCount > 0,
    zeroFileExplanation: part.fileCount === 0
      ? 'No analyzed TypeScript files were found in this detected part.'
      : undefined,
    isolatedExplanation: uses.length === 0 && usedBy.length === 0
      ? 'No detected connections to other parts.'
      : undefined,
    uses,
    usedBy,
    evidence: part.workspacePackage.evidence,
  };
}

function packageExplorationRelation(
  dependency: PackageDependency,
  relatedPackageId: string,
  labels: ReadonlyMap<string, string>,
): PackageExplorationRelation {
  return {
    id: dependency.id,
    relatedLabel: labels.get(relatedPackageId) ?? relatedPackageId,
    sourceLabel: labels.get(dependency.sourcePackageId) ?? dependency.sourcePackageId,
    targetLabel: labels.get(dependency.targetPackageId) ?? dependency.targetPackageId,
    fileDependencies: dependency.fileDependencies,
  };
}
