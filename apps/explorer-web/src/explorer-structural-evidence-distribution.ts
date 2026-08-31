import type { Responsibility, ResponsibilityFinding } from '@bunker-code/contracts';
import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import { resolveOwningTerritory } from './explorer-responsibility-projection.js';
import type {
  ExplorerTerritory,
  ExplorerTerritoryProjection,
} from './explorer-territory-projection.js';
import { orderedTerritoryChildren } from './explorer-territory-projection.js';

export interface ExplorerResponsibilityFindingCount {
  responsibility: Responsibility;
  findingCount: number;
}

export interface ExplorerStructuralEvidenceSummary {
  findingCount: number;
  responsibilityFindingCounts: ExplorerResponsibilityFindingCount[];
}

export interface ExplorerLocalStructuralEvidence extends ExplorerStructuralEvidenceSummary {
  findings: ResponsibilityFinding[];
}

export interface ExplorerStructuralEvidenceNode {
  territoryId: string;
  territoryKind: ExplorerTerritory['kind'];
  label: string;
  path: string;
  localEvidence: ExplorerLocalStructuralEvidence;
  subtreeEvidence: ExplorerStructuralEvidenceSummary;
  children: ExplorerStructuralEvidenceNode[];
}

export interface ExplorerStructuralEvidenceDistribution {
  root: ExplorerStructuralEvidenceNode;
}

export function createExplorerStructuralEvidenceDistribution(
  territories: ExplorerTerritoryProjection,
  responsibilities: ExplorerResponsibilityProjection,
): ExplorerStructuralEvidenceDistribution {
  const findingsByTerritoryId = new Map<string, ResponsibilityFinding[]>();

  for (const finding of responsibilities.groups.flatMap((group) => (
    group.responsibilities.flatMap((item) => item.findings)
  ))) {
    const territoryId = resolveOwningTerritory(finding.subject.fileId, territories).id;
    const localFindings = findingsByTerritoryId.get(territoryId) ?? [];
    localFindings.push(finding);
    findingsByTerritoryId.set(territoryId, localFindings);
  }

  function buildNode(territory: ExplorerTerritory): ExplorerStructuralEvidenceNode {
    const localFindings = [...(findingsByTerritoryId.get(territory.id) ?? [])]
      .sort((left, right) => left.id.localeCompare(right.id));
    const children = orderedTerritoryChildren(territories, territory.id)
      .filter((child) => child.kind === 'territory')
      .map((child) => {
        const childTerritory = territories.territoriesById.get(child.territoryId);
        if (!childTerritory) {
          throw new Error(`Structural evidence Territory not found: ${child.territoryId}`);
        }
        return buildNode(childTerritory);
      });
    const localEvidenceSummary = summarizeFindings(localFindings);

    return {
      territoryId: territory.id,
      territoryKind: territory.kind,
      label: territory.label,
      path: territory.normalizedStructuralPath,
      localEvidence: {
        findings: localFindings,
        ...localEvidenceSummary,
      },
      subtreeEvidence: mergeEvidenceSummaries([
        localEvidenceSummary,
        ...children.map((child) => child.subtreeEvidence),
      ]),
      children,
    };
  }

  return { root: buildNode(territories.system) };
}

function summarizeFindings(findings: readonly ResponsibilityFinding[]): ExplorerStructuralEvidenceSummary {
  const counts = new Map<Responsibility, number>();
  for (const finding of findings) {
    counts.set(finding.responsibility, (counts.get(finding.responsibility) ?? 0) + 1);
  }

  return {
    findingCount: findings.length,
    responsibilityFindingCounts: [...counts]
      .map(([responsibility, findingCount]) => ({ responsibility, findingCount }))
      .sort((left, right) => left.responsibility.localeCompare(right.responsibility)),
  };
}

function mergeEvidenceSummaries(
  summaries: readonly ExplorerStructuralEvidenceSummary[],
): ExplorerStructuralEvidenceSummary {
  const counts = new Map<Responsibility, number>();
  for (const summary of summaries) {
    for (const count of summary.responsibilityFindingCounts) {
      counts.set(count.responsibility, (counts.get(count.responsibility) ?? 0) + count.findingCount);
    }
  }

  return {
    findingCount: summaries.reduce((total, summary) => total + summary.findingCount, 0),
    responsibilityFindingCounts: [...counts]
      .map(([responsibility, findingCount]) => ({ responsibility, findingCount }))
      .sort((left, right) => left.responsibility.localeCompare(right.responsibility)),
  };
}
