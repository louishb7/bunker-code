import type { Responsibility, ResponsibilityFinding } from '@bunker-code/contracts';
import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import type {
  ExplorerSystemMapProjection,
} from './explorer-system-map-projection.js';
import {
  orderedTerritoryChildren,
  type ExplorerTerritoryProjection,
} from './explorer-territory-projection.js';

export interface ExplorerSystemMapResponsibilityLocation {
  itemId: string;
  findingCount: number;
  findings: ResponsibilityFinding[];
  subjectIds: string[];
  fileIds: string[];
  evidenceIds: string[];
}

export interface ExplorerSystemMapResponsibilityOverlay {
  responsibility: Responsibility;
  findingCount: number;
  locations: ExplorerSystemMapResponsibilityLocation[];
}

export interface ExplorerSystemMapResponsibilityOverlayProjection {
  overlays: ExplorerSystemMapResponsibilityOverlay[];
}

export function createExplorerSystemMapResponsibilityOverlayProjection(
  systemMap: Extract<ExplorerSystemMapProjection, { status: 'ready' }>,
  responsibilities: ExplorerResponsibilityProjection,
  territories: ExplorerTerritoryProjection,
): ExplorerSystemMapResponsibilityOverlayProjection {
  const itemIdByFileId = new Map<string, string>();

  for (const item of systemMap.items) {
    if (item.kind === 'file') {
      itemIdByFileId.set(item.file.id, item.id);
    } else {
      collectTerritoryFiles(territories, item.territory.id, item.id, itemIdByFileId);
    }
  }

  const itemOrder = new Map(systemMap.items.map((item, index) => [item.id, index] as const));
  const overlays = responsibilities.groups.flatMap((group) => group.responsibilities).flatMap((item) => {
    const findingsByItemId = new Map<string, ResponsibilityFinding[]>();

    for (const finding of item.findings) {
      const itemId = itemIdByFileId.get(finding.subject.fileId);
      if (!itemId) continue;
      const findings = findingsByItemId.get(itemId) ?? [];
      findings.push(finding);
      findingsByItemId.set(itemId, findings);
    }

    const locations = [...findingsByItemId.entries()]
      .map(([itemId, findings]): ExplorerSystemMapResponsibilityLocation => ({
        itemId,
        findingCount: findings.length,
        findings,
        subjectIds: orderedUnique(findings.map((finding) => finding.subject.id)),
        fileIds: orderedUnique(findings.map((finding) => finding.subject.fileId)),
        evidenceIds: orderedUnique(findings.flatMap((finding) => finding.evidence.map((evidence) => evidence.id))),
      }))
      .sort((left, right) => (itemOrder.get(left.itemId) ?? Number.MAX_SAFE_INTEGER)
        - (itemOrder.get(right.itemId) ?? Number.MAX_SAFE_INTEGER)
        || left.itemId.localeCompare(right.itemId));

    return locations.length === 0 ? [] : [{
      responsibility: item.responsibility,
      findingCount: locations.reduce((total, location) => total + location.findingCount, 0),
      locations,
    }];
  });

  return { overlays };
}

export function systemMapResponsibilityOverlay(
  projection: ExplorerSystemMapResponsibilityOverlayProjection,
  responsibility: Responsibility | null,
): ExplorerSystemMapResponsibilityOverlay | null {
  if (responsibility === null) return null;
  return projection.overlays.find((overlay) => overlay.responsibility === responsibility) ?? null;
}

function collectTerritoryFiles(
  territories: ExplorerTerritoryProjection,
  territoryId: string,
  itemId: string,
  itemIdByFileId: Map<string, string>,
): void {
  for (const child of orderedTerritoryChildren(territories, territoryId)) {
    if (child.kind === 'file') {
      itemIdByFileId.set(child.fileId, itemId);
    } else {
      collectTerritoryFiles(territories, child.territoryId, itemId, itemIdByFileId);
    }
  }
}

function orderedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
