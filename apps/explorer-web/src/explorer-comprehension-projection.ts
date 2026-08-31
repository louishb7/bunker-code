import type {
  Responsibility,
  ResponsibilityConfidence,
  ResponsibilityCoverage,
  ResponsibilityFamily,
  ResponsibilitySubject,
  SourceLocation,
} from '@bunker-code/contracts';
import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import { resolveOwningTerritory } from './explorer-responsibility-projection.js';
import type { ExplorerSystemOrientationProjection } from './explorer-system-orientation.js';
import type {
  ExplorerTerritoryChild,
  ExplorerTerritoryProjection,
  TerritoryKind,
} from './explorer-territory-projection.js';
import { orderedTerritoryChildren } from './explorer-territory-projection.js';

export type ExplorerComprehensionAnchor =
  | { kind: 'territory'; territoryId: string; path: string }
  | { kind: 'file'; fileId: string; path: string }
  | { kind: 'subject'; subjectId: string; fileId: string; territoryId: string; location: SourceLocation };

export type ExplorerObservablePart =
  | {
    id: string;
    kind: 'territory';
    territoryKind: TerritoryKind;
    label: string;
    analyzedFileCount: number;
    anchor: Extract<ExplorerComprehensionAnchor, { kind: 'territory' }>;
  }
  | {
    id: string;
    kind: 'file';
    label: string;
    anchor: Extract<ExplorerComprehensionAnchor, { kind: 'file' }>;
  };

export interface ExplorerKnownResponsibility {
  id: string;
  kind: 'responsibility-finding';
  responsibility: Responsibility;
  family: ResponsibilityFamily;
  confidence: ResponsibilityConfidence;
  subject: ResponsibilitySubject;
  observablePartId: string;
  anchor: Extract<ExplorerComprehensionAnchor, { kind: 'subject' }>;
}

export type ExplorerFactualRelation =
  | {
    id: string;
    kind: 'package-dependency';
    source: { id: string; label: string; rootPath: string; anchor: Extract<ExplorerComprehensionAnchor, { kind: 'territory' }> };
    target: { id: string; label: string; rootPath: string; anchor: Extract<ExplorerComprehensionAnchor, { kind: 'territory' }> };
    fileDependencyCount: number;
  }
  | {
    id: string;
    kind: 'external-module-touchpoint';
    moduleSpecifier: string;
    sourcePackageIds: string[];
    sourceAnchors: Array<Extract<ExplorerComprehensionAnchor, { kind: 'file' }>>;
  }
  | {
    id: string;
    kind: 'dependency-cycle';
    fileAnchors: Array<Extract<ExplorerComprehensionAnchor, { kind: 'file' }>>;
  }
  | {
    id: string;
    kind: 'dependency-isolation';
    fileAnchor: Extract<ExplorerComprehensionAnchor, { kind: 'file' }>;
  };

export interface ExplorerArchitecturalMeaningUndetermined {
  kind: 'architectural-meaning-undetermined';
  observablePartId: string;
  anchor: ExplorerObservablePart['anchor'];
  reason: 'no-part-level-interpretation';
}

export type ExplorerResponsibilityKnowledgeLimit = Exclude<ResponsibilityCoverage, { status: 'evaluated' }>;

export interface ExplorerResponsibilityCoverageObservation {
  kind: 'responsibility-coverage';
  coverage: ExplorerResponsibilityKnowledgeLimit;
  anchor: ExplorerComprehensionAnchor;
}

export interface ExplorerUnresolvedDependency {
  id: string;
  kind: 'unresolved-dependency';
  moduleSpecifier: string;
  reason: string;
  sourceAnchor: Extract<ExplorerComprehensionAnchor, { kind: 'file' }>;
}

export interface ExplorerComprehensionProjection {
  observableParts: ExplorerObservablePart[];
  knownResponsibilities: ExplorerKnownResponsibility[];
  factualRelations: ExplorerFactualRelation[];
  uncertainty: {
    architecturalMeaningUndetermined: ExplorerArchitecturalMeaningUndetermined[];
    responsibilityCoverage: ExplorerResponsibilityCoverageObservation[];
    unresolvedDependencies: ExplorerUnresolvedDependency[];
  };
}

export function createExplorerComprehensionProjection(
  territories: ExplorerTerritoryProjection,
  orientation: ExplorerSystemOrientationProjection,
  responsibilities: ExplorerResponsibilityProjection,
): ExplorerComprehensionProjection {
  const observableParts = orderedTerritoryChildren(territories, territories.system.id)
    .map((child) => observablePartFor(child, territories));
  const observablePartIds = new Set(observableParts.map((part) => part.id));
  const knownResponsibilities = responsibilities.groups.flatMap((group) => (
    group.responsibilities.flatMap((item) => item.findings.map((finding) => {
      const territory = resolveOwningTerritory(finding.subject.fileId, territories);
      const observablePartId = observablePartIdFor(finding.subject.fileId, territory.id, territories, observablePartIds);

      return {
        id: finding.id,
        kind: 'responsibility-finding' as const,
        responsibility: finding.responsibility,
        family: group.family,
        confidence: finding.confidence,
        subject: finding.subject,
        observablePartId,
        anchor: {
          kind: 'subject' as const,
          subjectId: finding.subject.id,
          fileId: finding.subject.fileId,
          territoryId: territory.id,
          location: finding.subject.location,
        },
      };
    }))
  )).sort((left, right) => left.id.localeCompare(right.id));
  return {
    observableParts,
    knownResponsibilities,
    factualRelations: [
      ...orientation.packageConnections.map((connection): ExplorerFactualRelation => ({
        id: connection.id,
        kind: 'package-dependency',
        source: {
          ...connection.source,
          anchor: packageAnchor(connection.source, territories),
        },
        target: {
          ...connection.target,
          anchor: packageAnchor(connection.target, territories),
        },
        fileDependencyCount: connection.fileDependencyCount,
      })),
      ...orientation.externalModules.map((usage): ExplorerFactualRelation => ({
        id: `external-module:${usage.moduleSpecifier}`,
        kind: 'external-module-touchpoint',
        moduleSpecifier: usage.moduleSpecifier,
        sourcePackageIds: [...usage.sourcePackageIds],
        sourceAnchors: usage.sourceFileIds.map((fileId) => fileAnchor(fileId, territories)),
      })),
      ...orientation.cycles.map((cycle): ExplorerFactualRelation => ({
        id: `dependency-cycle:${cycle.fileIds.join('|')}`,
        kind: 'dependency-cycle',
        fileAnchors: cycle.fileIds.map((fileId) => fileAnchor(fileId, territories)),
      })),
      ...orientation.isolatedFiles.map((file): ExplorerFactualRelation => ({
        id: `dependency-isolation:${file.id}`,
        kind: 'dependency-isolation',
        fileAnchor: { ...fileAnchor(file.id, territories), path: file.path },
      })),
    ].sort((left, right) => left.id.localeCompare(right.id)),
    uncertainty: {
      architecturalMeaningUndetermined: observableParts.map((part) => ({
        kind: 'architectural-meaning-undetermined',
        observablePartId: part.id,
        anchor: part.anchor,
        reason: 'no-part-level-interpretation',
      })),
      responsibilityCoverage: responsibilities.coverage
        .filter(isResponsibilityKnowledgeLimit)
        .map((coverage) => ({
          kind: 'responsibility-coverage',
          coverage,
          anchor: coverageAnchor(coverage, territories),
        })),
      unresolvedDependencies: orientation.unresolvedDependencies.map((dependency) => ({
        id: dependency.id,
        kind: 'unresolved-dependency',
        moduleSpecifier: dependency.moduleSpecifier,
        reason: dependency.reason,
        sourceAnchor: fileAnchor(dependency.sourceFileId, territories),
      })),
    },
  };
}

function observablePartFor(
  child: ExplorerTerritoryChild,
  territories: ExplorerTerritoryProjection,
): ExplorerObservablePart {
  if (child.kind === 'file') {
    return {
      id: child.fileId,
      kind: 'file',
      label: child.label,
      anchor: { kind: 'file', fileId: child.fileId, path: child.structuralPath.slice(1).join('/') },
    };
  }

  const territory = territories.territoriesById.get(child.territoryId);
  if (!territory || territory.kind === 'system') {
    throw new Error(`Observable Territory not found: ${child.territoryId}`);
  }

  return {
    id: territory.id,
    kind: 'territory',
    territoryKind: territory.kind,
    label: territory.label,
    analyzedFileCount: territory.analyzedFileCount,
    anchor: territoryAnchor(territory.id, territories),
  };
}

function observablePartIdFor(
  fileId: string,
  owningTerritoryId: string,
  territories: ExplorerTerritoryProjection,
  observablePartIds: ReadonlySet<string>,
): string {
  if (observablePartIds.has(fileId)) return fileId;

  let territoryId: string | null = owningTerritoryId;
  while (territoryId !== null) {
    if (observablePartIds.has(territoryId)) return territoryId;
    const parentId = territories.parentTerritoryIdById.get(territoryId);
    if (parentId === undefined) throw new Error(`Territory ancestry not found: ${territoryId}`);
    territoryId = parentId;
  }

  throw new Error(`Responsibility finding has no observable system part: ${fileId}`);
}

function territoryAnchor(
  territoryId: string,
  territories: ExplorerTerritoryProjection,
): Extract<ExplorerComprehensionAnchor, { kind: 'territory' }> {
  const territory = territories.territoriesById.get(territoryId);
  if (!territory) throw new Error(`Territory anchor not found: ${territoryId}`);
  return { kind: 'territory', territoryId, path: territory.normalizedStructuralPath };
}

function packageAnchor(
  workspacePackage: { id: string; rootPath: string },
  territories: ExplorerTerritoryProjection,
): Extract<ExplorerComprehensionAnchor, { kind: 'territory' }> {
  return workspacePackage.rootPath === '.'
    ? territoryAnchor(territories.system.id, territories)
    : territoryAnchor(workspacePackage.id, territories);
}

function fileAnchor(
  fileId: string,
  territories: ExplorerTerritoryProjection,
): Extract<ExplorerComprehensionAnchor, { kind: 'file' }> {
  resolveOwningTerritory(fileId, territories);
  return { kind: 'file', fileId, path: fileId };
}

function coverageAnchor(
  coverage: ResponsibilityCoverage,
  territories: ExplorerTerritoryProjection,
): ExplorerComprehensionAnchor {
  if (coverage.scope.kind === 'project') return territoryAnchor(territories.system.id, territories);
  if (coverage.scope.kind === 'file') return fileAnchor(coverage.scope.fileId, territories);

  return fileAnchor(coverage.scope.fileId, territories);
}

function isResponsibilityKnowledgeLimit(
  coverage: ResponsibilityCoverage,
): coverage is ExplorerResponsibilityKnowledgeLimit {
  return coverage.status !== 'evaluated';
}
