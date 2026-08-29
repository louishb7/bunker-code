import type { ResponsibilityFinding, ResponsibilityFamily } from '@bunker-code/contracts';
import type {
  ExplorerResponsibilityItem,
  ExplorerResponsibilityProjection,
} from './explorer-responsibility-projection.js';

export const RESPONSIBILITY_SUBJECT_PREVIEW_LIMIT = 3;

export type ResponsibilitySpatialComposition = 'solo' | 'duo' | 'constellation';

export interface ResponsibilityLandmarkPresentation {
  item: ExplorerResponsibilityItem;
  subjectPreviews: ResponsibilityFinding[];
  omittedSubjectCount: number;
}

export interface ResponsibilityFamilyRegionPresentation {
  family: ResponsibilityFamily;
  responsibilities: ResponsibilityLandmarkPresentation[];
}

export interface ResponsibilitySpatialModel {
  composition: ResponsibilitySpatialComposition;
  familyRegions: ResponsibilityFamilyRegionPresentation[];
}

export function createResponsibilitySpatialModel(
  projection: ExplorerResponsibilityProjection,
): ResponsibilitySpatialModel {
  return {
    composition: compositionFor(projection.groups.length),
    familyRegions: projection.groups.map((group) => ({
      family: group.family,
      responsibilities: group.responsibilities.map((item) => {
        const subjectPreviews = uniqueSubjectFindings(item.findings)
          .slice(0, RESPONSIBILITY_SUBJECT_PREVIEW_LIMIT);

        return {
          item,
          subjectPreviews,
          omittedSubjectCount: Math.max(0, item.subjectCount - subjectPreviews.length),
        };
      }),
    })),
  };
}

function compositionFor(familyCount: number): ResponsibilitySpatialComposition {
  if (familyCount === 1) return 'solo';
  if (familyCount === 2) return 'duo';
  return 'constellation';
}

function uniqueSubjectFindings(findings: ResponsibilityFinding[]): ResponsibilityFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.subject.id)) return false;
    seen.add(finding.subject.id);
    return true;
  });
}
