import {
  RESPONSIBILITY_TAXONOMY,
  type Responsibility,
  type ResponsibilityAnalysisResult,
  type ResponsibilityCoverage,
  type ResponsibilityFamily,
  type ResponsibilityFinding,
} from '@bunker-code/contracts';
import type { ExplorerTerritory, ExplorerTerritoryProjection } from './explorer-territory-projection.js';

export type ExplorerPerspective = 'responsibility' | 'territory';

export interface ExplorerResponsibilityCoverageSummary {
  hasFindings: boolean;
  findingCount: number;
  hasEvaluatedCoverage: boolean;
  hasPartialCoverage: boolean;
  hasNotEvaluatedCoverage: boolean;
  hasFailures: boolean;
  hasUnsupportedCapabilities: boolean;
}

export interface ExplorerResponsibilityGroup {
  family: ResponsibilityFamily;
  responsibilities: ExplorerResponsibilityItem[];
}

export interface ExplorerResponsibilityItem {
  responsibility: Responsibility;
  findings: ResponsibilityFinding[];
  subjectCount: number;
  territoryIds: string[];
}

export interface ExplorerResponsibilityProjection {
  groups: ExplorerResponsibilityGroup[];
  coverage: ResponsibilityCoverage[];
  coverageSummary: ExplorerResponsibilityCoverageSummary;
}

const qualifyingFamilies = new Set<ResponsibilityFamily>([
  'interface',
  'security',
  'data',
  'integration',
  'async-processing',
]);

const taxonomyByResponsibility = new Map(
  RESPONSIBILITY_TAXONOMY.map((entry, index) => [entry.responsibility, { family: entry.family, index }] as const),
);

const familyOrder = [...new Set(RESPONSIBILITY_TAXONOMY.map((entry) => entry.family))];

export function createExplorerResponsibilityProjection(
  result: ResponsibilityAnalysisResult,
  territories: ExplorerTerritoryProjection,
): ExplorerResponsibilityProjection {
  const findingsByResponsibility = new Map<Responsibility, ResponsibilityFinding[]>();

  for (const finding of result.findings) {
    const findings = findingsByResponsibility.get(finding.responsibility) ?? [];
    findings.push(finding);
    findingsByResponsibility.set(finding.responsibility, findings);
  }

  const responsibilities = RESPONSIBILITY_TAXONOMY.flatMap(({ family, responsibility }) => {
    const findings = findingsByResponsibility.get(responsibility);
    if (!findings || findings.length === 0) return [];

    const orderedFindings = [...findings].sort(compareFindings);
    const territoryIds = [...new Set(
      orderedFindings
        .map((finding) => resolveOwningTerritory(finding.subject.fileId, territories).id),
    )].sort(compareTerritoryIds(territories));

    return [{
      family,
      item: {
        responsibility,
        findings: orderedFindings,
        subjectCount: new Set(orderedFindings.map((finding) => finding.subject.id)).size,
        territoryIds,
      },
    }];
  });

  const groupsByFamily = new Map<ResponsibilityFamily, ExplorerResponsibilityItem[]>();
  for (const responsibility of responsibilities) {
    const items = groupsByFamily.get(responsibility.family) ?? [];
    items.push(responsibility.item);
    groupsByFamily.set(responsibility.family, items);
  }

  return {
    groups: familyOrder.flatMap((family) => {
      const responsibilitiesForFamily = groupsByFamily.get(family);
      return responsibilitiesForFamily && responsibilitiesForFamily.length > 0
        ? [{ family, responsibilities: responsibilitiesForFamily }]
        : [];
    }),
    coverage: [...result.coverage].sort(compareCoverage),
    coverageSummary: summarizeCoverage(result),
  };
}

export function isResponsibilityPerspectiveEligible(
  result: Pick<ResponsibilityAnalysisResult, 'findings'>,
): boolean {
  return result.findings.some((finding) => qualifyingFamilies.has(familyFor(finding.responsibility)));
}

export function resolveOwningTerritory(
  fileId: string,
  territories: ExplorerTerritoryProjection,
): ExplorerTerritory {
  const owner = [...territories.territoriesById.values()]
    .filter((territory) => territories.childrenByTerritoryId.get(territory.id)
      ?.some((child) => child.kind === 'file' && child.fileId === fileId) ?? false)
    .sort((left, right) => right.structuralPath.length - left.structuralPath.length || left.id.localeCompare(right.id))[0];

  if (!owner) {
    throw new Error(`Responsibility finding file is not present in Explorer territory containment: ${fileId}`);
  }

  return owner;
}

function summarizeCoverage(result: ResponsibilityAnalysisResult): ExplorerResponsibilityCoverageSummary {
  return {
    hasFindings: result.findings.length > 0,
    findingCount: result.findings.length,
    hasEvaluatedCoverage: result.coverage.some((coverage) => coverage.status === 'evaluated'),
    hasPartialCoverage: result.coverage.some((coverage) => coverage.status === 'partially-evaluated'),
    hasNotEvaluatedCoverage: result.coverage.some((coverage) => coverage.status === 'not-evaluated'),
    hasFailures: result.coverage.some((coverage) => coverage.status === 'failed'),
    hasUnsupportedCapabilities: result.coverage.some((coverage) => coverage.status === 'unsupported'),
  };
}

function familyFor(responsibility: Responsibility): ResponsibilityFamily {
  const entry = taxonomyByResponsibility.get(responsibility);
  if (!entry) {
    throw new Error(`Responsibility is missing from the canonical taxonomy: ${responsibility}`);
  }
  return entry.family;
}

function compareFindings(left: ResponsibilityFinding, right: ResponsibilityFinding): number {
  return left.subject.fileId.localeCompare(right.subject.fileId)
    || left.subject.location.line - right.subject.location.line
    || left.subject.location.column - right.subject.location.column
    || left.subject.id.localeCompare(right.subject.id)
    || left.id.localeCompare(right.id);
}

function compareTerritoryIds(territories: ExplorerTerritoryProjection): (left: string, right: string) => number {
  return (left, right) => {
    const leftTerritory = territories.territoriesById.get(left);
    const rightTerritory = territories.territoriesById.get(right);
    return (leftTerritory?.normalizedStructuralPath ?? left).localeCompare(rightTerritory?.normalizedStructuralPath ?? right)
      || left.localeCompare(right);
  };
}

function compareCoverage(left: ResponsibilityCoverage, right: ResponsibilityCoverage): number {
  return taxonomyIndex(left.capability) - taxonomyIndex(right.capability)
    || scopeKey(left).localeCompare(scopeKey(right))
    || left.status.localeCompare(right.status);
}

function taxonomyIndex(responsibility: Responsibility): number {
  const entry = taxonomyByResponsibility.get(responsibility);
  if (!entry) {
    throw new Error(`Responsibility is missing from the canonical taxonomy: ${responsibility}`);
  }
  return entry.index;
}

function scopeKey(coverage: ResponsibilityCoverage): string {
  const { scope } = coverage;
  if (scope.kind === 'project') return 'project';
  if (scope.kind === 'file') return `file:${scope.fileId}`;
  return `subject:${scope.fileId}:${scope.subjectId}`;
}
