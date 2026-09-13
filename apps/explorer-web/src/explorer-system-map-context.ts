import type {
  ResponsibilityCoverage,
  ResponsibilityLimitation,
} from '@bunker-code/contracts';
import type { ProjectGraphEdge, UnresolvedGraphDependency } from '@bunker-code/graph-engine';
import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import type { ExplorerSystemMapProjection } from './explorer-system-map-projection.js';
import type { ExplorerSystemOrientationProjection } from './explorer-system-orientation.js';
import {
  orderedTerritoryChildren,
  type ExplorerTerritoryProjection,
} from './explorer-territory-projection.js';

export interface ExplorerSystemMapExternalTouchpoint {
  moduleSpecifier: string;
  sources: Array<{
    itemId: string;
    fileId: string;
    edge: ProjectGraphEdge;
  }>;
}

export interface ExplorerSystemMapAnalysisLimit {
  coverage: Exclude<ResponsibilityCoverage, { status: 'evaluated' }>;
  itemId: string | null;
  limitations: ResponsibilityLimitation[];
}

export interface ExplorerSystemMapUnresolvedDependency {
  itemId: string;
  dependency: UnresolvedGraphDependency;
}

export interface ExplorerSystemMapCycle {
  id: string;
  fileIds: string[];
  itemIds: string[];
}

export interface ExplorerSystemMapIsolatedFile {
  itemId: string;
  fileId: string;
}

export interface ExplorerSystemMapContextProjection {
  externalTouchpoints: ExplorerSystemMapExternalTouchpoint[];
  analysisLimits: ExplorerSystemMapAnalysisLimit[];
  unresolvedDependencies: ExplorerSystemMapUnresolvedDependency[];
  cycles: ExplorerSystemMapCycle[];
  isolatedFiles: ExplorerSystemMapIsolatedFile[];
}

export function createExplorerSystemMapContextProjection(
  systemMap: Extract<ExplorerSystemMapProjection, { status: 'ready' }>,
  orientation: ExplorerSystemOrientationProjection,
  responsibilities: ExplorerResponsibilityProjection,
  responsibilityLimitations: ResponsibilityLimitation[],
  territories: ExplorerTerritoryProjection,
): ExplorerSystemMapContextProjection {
  const itemIdByFileId = systemMapItemIdsByFileId(systemMap, territories);
  const limitationsById = new Map(responsibilityLimitations.map((limitation) => [limitation.id, limitation] as const));

  return {
    externalTouchpoints: orientation.externalModules.flatMap((touchpoint) => {
      const sources = touchpoint.fileEdges.flatMap((edge) => {
        const itemId = itemIdByFileId.get(edge.sourceNodeId);
        return itemId ? [{ itemId, fileId: edge.sourceNodeId, edge }] : [];
      });
      return sources.length > 0 ? [{ moduleSpecifier: touchpoint.moduleSpecifier, sources }] : [];
    }),
    analysisLimits: responsibilities.coverage.flatMap((coverage) => {
      if (coverage.status === 'evaluated') return [];
      const itemId = coverage.scope.kind === 'project'
        ? null
        : itemIdByFileId.get(coverage.scope.fileId) ?? null;
      const limitationIds = 'limitationIds' in coverage ? coverage.limitationIds : [];
      return [{
        coverage,
        itemId,
        limitations: limitationIds.flatMap((id) => {
          const limitation = limitationsById.get(id);
          return limitation ? [limitation] : [];
        }),
      }];
    }),
    unresolvedDependencies: orientation.unresolvedDependencies.flatMap(({ dependency }) => {
      const itemId = itemIdByFileId.get(dependency.sourceNodeId);
      return itemId ? [{ itemId, dependency }] : [];
    }),
    cycles: orientation.cycles.flatMap((cycle) => {
      const itemIds = [...new Set(cycle.fileIds.flatMap((fileId) => {
        const itemId = itemIdByFileId.get(fileId);
        return itemId ? [itemId] : [];
      }))].sort();
      return itemIds.length > 0 ? [{
        id: `dependency-cycle:${cycle.fileIds.join('|')}`,
        fileIds: [...cycle.fileIds],
        itemIds,
      }] : [];
    }),
    isolatedFiles: orientation.isolatedFiles.flatMap((file) => {
      const itemId = itemIdByFileId.get(file.id);
      return itemId ? [{ itemId, fileId: file.id }] : [];
    }),
  };
}

export function systemMapContextForItem(
  context: ExplorerSystemMapContextProjection,
  itemId: string,
): ExplorerSystemMapContextProjection {
  return {
    externalTouchpoints: context.externalTouchpoints.flatMap((touchpoint) => {
      const sources = touchpoint.sources.filter((source) => source.itemId === itemId);
      return sources.length > 0 ? [{ ...touchpoint, sources }] : [];
    }),
    analysisLimits: context.analysisLimits.filter((limit) => limit.itemId === null || limit.itemId === itemId),
    unresolvedDependencies: context.unresolvedDependencies.filter((dependency) => dependency.itemId === itemId),
    cycles: context.cycles.filter((cycle) => cycle.itemIds.includes(itemId)),
    isolatedFiles: context.isolatedFiles.filter((file) => file.itemId === itemId),
  };
}

function systemMapItemIdsByFileId(
  systemMap: Extract<ExplorerSystemMapProjection, { status: 'ready' }>,
  territories: ExplorerTerritoryProjection,
): Map<string, string> {
  const itemIdByFileId = new Map<string, string>();
  for (const item of systemMap.items) {
    if (item.kind === 'file') {
      itemIdByFileId.set(item.file.id, item.id);
      continue;
    }
    collectTerritoryFiles(item.territory.id, item.id, territories, itemIdByFileId);
  }
  return itemIdByFileId;
}

function collectTerritoryFiles(
  territoryId: string,
  itemId: string,
  territories: ExplorerTerritoryProjection,
  itemIdByFileId: Map<string, string>,
): void {
  for (const child of orderedTerritoryChildren(territories, territoryId)) {
    if (child.kind === 'file') {
      itemIdByFileId.set(child.fileId, itemId);
    } else {
      collectTerritoryFiles(child.territoryId, itemId, territories, itemIdByFileId);
    }
  }
}
