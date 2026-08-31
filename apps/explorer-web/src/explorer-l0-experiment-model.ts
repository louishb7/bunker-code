import type { Responsibility } from '@bunker-code/contracts';
import type {
  ExplorerComprehensionProjection,
  ExplorerFactualRelation,
} from './explorer-comprehension-projection.js';
import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import type {
  ExplorerStructuralEvidenceDistribution,
  ExplorerStructuralEvidenceNode,
} from './explorer-structural-evidence-distribution.js';
import type { ExplorerTerritoryProjection } from './explorer-territory-projection.js';

export type ExplorerL0ExperimentVariant = 'structure-first' | 'evidence-first';

export interface ExplorerL0EvidenceLocation {
  territoryId: string;
  label: string;
  path: string;
  findingCount: number;
}

export interface ExplorerL0EvidenceGroup {
  responsibility: Responsibility;
  findingCount: number;
  locations: ExplorerL0EvidenceLocation[];
}

export interface ExplorerL0ExperimentFactSet {
  territoryIds: string[];
  findingIds: string[];
  relationIds: string[];
  uncertaintyIds: string[];
}

export interface ExplorerL0ExperimentModel {
  factSet: ExplorerL0ExperimentFactSet;
  factSetKey: string;
  structureRoot: ExplorerStructuralEvidenceNode;
  evidenceGroups: ExplorerL0EvidenceGroup[];
  systemParts: ExplorerStructuralEvidenceNode[];
  relations: ExplorerFactualRelation[];
  uncertainty: ExplorerComprehensionProjection['uncertainty'];
}

export function createExplorerL0ExperimentModel(
  comprehension: ExplorerComprehensionProjection,
  distribution: ExplorerStructuralEvidenceDistribution,
  territories: ExplorerTerritoryProjection,
  responsibilities: ExplorerResponsibilityProjection,
): ExplorerL0ExperimentModel {
  const structuralNodes = flattenStructuralNodes(distribution.root);
  const evidenceGroups = responsibilities.groups.flatMap((group) => (
    group.responsibilities.map((item): ExplorerL0EvidenceGroup => ({
      responsibility: item.responsibility,
      findingCount: item.findings.length,
      locations: structuralNodes.flatMap((node) => {
        const findingCount = node.localEvidence.responsibilityFindingCounts
          .find((count) => count.responsibility === item.responsibility)?.findingCount ?? 0;
        return findingCount === 0 ? [] : [{
          territoryId: node.territoryId,
          label: node.label,
          path: node.path,
          findingCount,
        }];
      }),
    }))
  ));
  const factSet: ExplorerL0ExperimentFactSet = {
    territoryIds: structuralNodes.map((node) => node.territoryId),
    findingIds: structuralNodes
      .flatMap((node) => node.localEvidence.findings.map((finding) => finding.id))
      .sort(),
    relationIds: comprehension.factualRelations.map((relation) => relation.id),
    uncertaintyIds: uncertaintyIds(comprehension.uncertainty),
  };

  if (factSet.territoryIds.length !== territories.territoriesById.size) {
    throw new Error('L0 experiment structural facts do not match the Territory projection.');
  }

  return {
    factSet,
    factSetKey: JSON.stringify(factSet),
    structureRoot: distribution.root,
    evidenceGroups,
    systemParts: distribution.root.children,
    relations: comprehension.factualRelations,
    uncertainty: comprehension.uncertainty,
  };
}

export function readExplorerL0ExperimentVariant(search: string): ExplorerL0ExperimentVariant | null {
  const variant = new URLSearchParams(search).get('l0-experiment');
  return variant === 'structure-first' || variant === 'evidence-first' ? variant : null;
}

function flattenStructuralNodes(node: ExplorerStructuralEvidenceNode): ExplorerStructuralEvidenceNode[] {
  return [node, ...node.children.flatMap((child) => flattenStructuralNodes(child))];
}

function uncertaintyIds(uncertainty: ExplorerComprehensionProjection['uncertainty']): string[] {
  return [
    ...uncertainty.architecturalMeaningUndetermined.map((item) => `meaning:${item.observablePartId}`),
    ...uncertainty.responsibilityCoverage.map(({ coverage }) => (
      `coverage:${coverage.capability}:${coverage.scope.kind}:${coverage.status}`
    )),
    ...uncertainty.unresolvedDependencies.map((dependency) => `unresolved:${dependency.id}`),
  ];
}
