import type {
  ExplorerSystemMapFrontierItem,
  ExplorerSystemMapFrontierProjection,
  ExplorerSystemMapFrontierRelation,
} from './explorer-system-map-frontier-projection.js';
import type { ExplorerSystemMapGeography, ExplorerSystemMapRegion } from './explorer-system-map-geography.js';

export type SystemMapFieldRelationDirection = 'outgoing' | 'incoming';
export type SystemMapFieldHandleSide = 'top' | 'right' | 'bottom' | 'left';
export type SystemMapFieldItemAttention = 'selected' | 'outgoing' | 'incoming' | 'both' | 'dimmed' | 'resting';

export interface SystemMapFieldItemPlacement {
  item: ExplorerSystemMapFrontierItem;
  position: { x: number; y: number };
  parentId?: string;
  absolutePosition: { x: number; y: number };
}

export interface SystemMapContextFrame {
  id: string;
  region: ExplorerSystemMapRegion;
  parentId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  passive: boolean;
  absolutePosition: { x: number; y: number };
}

export interface SystemMapFieldModel {
  items: SystemMapFieldItemPlacement[];
  frames: SystemMapContextFrame[];
  relations: ExplorerSystemMapFrontierRelation[];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface SystemMapFieldSelection {
  itemAttention: Map<string, SystemMapFieldItemAttention>;
  relationDirections: Map<string, SystemMapFieldRelationDirection>;
}

const territoryWidth = 224;
const territoryHeight = 132;
const fileWidth = 224;
const fileHeight = 76;
const gap = 24;
const inset = 20;
const header = 68;

export function createSystemMapFieldModel(
  projection: ExplorerSystemMapFrontierProjection,
  context?: { geography: ExplorerSystemMapGeography; refinedRegionIds: ReadonlySet<string>; viewportWidth?: number },
): SystemMapFieldModel {
  const visibleIds = new Set(projection.items.map((item) => item.id));
  const regions = context?.geography.regionsById;
  const opened = new Map<string, ExplorerSystemMapRegion>();
  for (const id of context?.refinedRegionIds ?? []) {
    const region = regions?.get(id);
    if (!region) throw new Error(`System Map context region not found: ${id}`);
    let ancestor = region.parentRegionId;
    let hidden = visibleIds.has(id) || id === projection.boundary.id;
    while (ancestor) {
      if (visibleIds.has(ancestor)) hidden = true;
      ancestor = regions?.get(ancestor)?.parentRegionId ?? null;
    }
    if (!hidden) opened.set(id, region);
  }
  const fileParents = new Map<string, string>();
  for (const region of regions?.values() ?? []) {
    for (const fileId of region.directFileIds) fileParents.set(fileId, region.id);
  }
  const contextRegions = new Map(opened);
  const anchoredParents = new Set<string>();
  for (const regionId of [
    ...projection.items.map((item) => item.kind === 'region' ? item.region.parentRegionId : fileParents.get(item.fileId)),
    ...[...opened.values()].map((region) => region.parentRegionId),
  ]) {
    if (regionId) anchoredParents.add(regionId);
    let current = regionId;
    while (current && current !== projection.boundary.id) {
      const region = regions?.get(current);
      if (!region || visibleIds.has(current)) break;
      contextRegions.set(current, region);
      current = region.parentRegionId;
    }
  }
  // A skipped chain gets one geographic frame with its full path, not a stack
  // of empty borders. Its terminal subdivision still contextualizes direct files.
  for (const [id, region] of contextRegions) {
    if (!opened.has(id) && !anchoredParents.has(id) && region.childRegionIds.length === 1) contextRegions.delete(id);
  }
  function parentFrame(regionId: string | null): string | undefined {
    let current = regionId;
    while (current) {
      if (contextRegions.has(current)) return `context:${current}`;
      current = regions?.get(current)?.parentRegionId ?? null;
    }
    return undefined;
  }
  const frames: SystemMapContextFrame[] = [...contextRegions.values()].sort((a, b) => a.id.localeCompare(b.id)).map((region) => ({
    id: `context:${region.id}`, region, parentId: parentFrame(region.parentRegionId),
    position: { x: 0, y: 0 }, width: 0, height: 0,
    absolutePosition: { x: 0, y: 0 }, passive: !opened.has(region.id),
  }));
  const items = [...projection.items].sort((a, b) => a.id.localeCompare(b.id)).map((item): SystemMapFieldItemPlacement => ({
    item, parentId: parentFrame(item.kind === 'region' ? item.region.parentRegionId : fileParents.get(item.fileId) ?? null),
    position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
  }));
  type Box = { id: string; width: number; height: number; position: { x: number; y: number } };
  const orderedFrames: SystemMapContextFrame[] = [];
  const rootBudget = Math.max(760, Math.min(1600, (context?.viewportWidth ?? 1360) - 64));
  // Ordered shelves retain neighbors. Only overflowing rows wrap; dependencies
  // and selection never influence the packing budget or order.
  function layout(budget: number, parentId?: string): { width: number; height: number } {
    const childFrames = frames.filter((frame) => frame.parentId === parentId);
    const children = items.filter((entry) => entry.parentId === parentId);
    const regionalBudget = childFrames.length + children.length > 6 && budget >= 1100 ? (budget - gap) / 2 : 800;
    for (const frame of childFrames) {
      orderedFrames.push(frame);
      const size = layout(Math.max(territoryWidth, Math.min(frame.passive ? budget : regionalBudget, budget - inset * 2)), frame.id);
      frame.width = Math.max(territoryWidth, size.width + inset * 2);
      frame.height = Math.max(territoryHeight, size.height + header + inset);
    }
    const boxes: Box[] = [
      ...childFrames.map((frame) => ({ id: frame.region.id, width: frame.width, height: frame.height, position: frame.position })),
      ...children.map((entry) => ({ id: entry.item.id, ...systemMapFieldDimensions[entry.item.kind], position: entry.position })),
    ].sort((a, b) => a.id.localeCompare(b.id));
    let width = 0;
    let height = 0;
    const rows: Array<{ y: number; x: number; height: number }> = [];
    for (const box of boxes) {
      let row = rows.find((candidate) => candidate.x + box.width <= budget && (box.height <= candidate.height || candidate === rows.at(-1)));
      if (!row) {
        row = { x: 0, y: rows.length ? height + gap : 0, height: box.height };
        rows.push(row);
      }
      box.position.x = row.x + (parentId ? inset : 0);
      box.position.y = row.y + (parentId ? header : 0);
      width = Math.max(width, row.x + box.width);
      height = Math.max(height, row.y + box.height);
      row.x += box.width + gap;
      row.height = Math.max(row.height, box.height);
    }
    return { width, height };
  }
  const size = layout(rootBudget);
  const framesById = new Map(frames.map((frame) => [frame.id, frame]));
  for (const entry of [...frames, ...items]) {
    entry.absolutePosition = { ...entry.position };
    let parent = entry.parentId;
    while (parent) {
      const frame = framesById.get(parent);
      if (!frame) throw new Error(`System Map context frame not found: ${parent}`);
      entry.absolutePosition.x += frame.position.x;
      entry.absolutePosition.y += frame.position.y;
      parent = frame.parentId;
    }
  }
  return { items, frames: orderedFrames, relations: projection.relations, bounds: { x: 0, y: 0, ...size } };
}

export function createSystemMapFieldRelationRoute(
  model: SystemMapFieldModel,
  relation: ExplorerSystemMapFrontierRelation,
): { sourceSide: SystemMapFieldHandleSide; targetSide: SystemMapFieldHandleSide } {
  const source = model.items.find(({ item }) => item.id === relation.sourceItemId);
  const target = model.items.find(({ item }) => item.id === relation.targetItemId);
  if (!source || !target) throw new Error('Territory Field relation references an unknown item: ' + relation.id);
  const sourceDimensions = systemMapFieldDimensions[source.item.kind];
  const targetDimensions = systemMapFieldDimensions[target.item.kind];
  const sourceCenter = {
    x: source.absolutePosition.x + sourceDimensions.width / 2,
    y: source.absolutePosition.y + sourceDimensions.height / 2,
  };
  const targetCenter = {
    x: target.absolutePosition.x + targetDimensions.width / 2,
    y: target.absolutePosition.y + targetDimensions.height / 2,
  };
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { sourceSide: 'right', targetSide: 'left' }
      : { sourceSide: 'left', targetSide: 'right' };
  }
  return deltaY >= 0
    ? { sourceSide: 'bottom', targetSide: 'top' }
    : { sourceSide: 'top', targetSide: 'bottom' };
}

export function createSystemMapFieldSelection(
  model: SystemMapFieldModel,
  selectedItemId: string | null,
): SystemMapFieldSelection {
  const itemAttention = new Map<string, SystemMapFieldItemAttention>();
  const relationDirections = new Map<string, SystemMapFieldRelationDirection>();

  if (selectedItemId === null) {
    for (const { item } of model.items) itemAttention.set(item.id, 'resting');
    return { itemAttention, relationDirections };
  }

  const outgoingIds = new Set<string>();
  const incomingIds = new Set<string>();
  for (const relation of model.relations) {
    if (relation.sourceItemId === selectedItemId) {
      relationDirections.set(relation.id, 'outgoing');
      outgoingIds.add(relation.targetItemId);
    } else if (relation.targetItemId === selectedItemId) {
      relationDirections.set(relation.id, 'incoming');
      incomingIds.add(relation.sourceItemId);
    }
  }

  for (const { item } of model.items) {
    const outgoing = outgoingIds.has(item.id);
    const incoming = incomingIds.has(item.id);
    itemAttention.set(
      item.id,
      item.id === selectedItemId
        ? 'selected'
        : outgoing && incoming
          ? 'both'
          : outgoing
            ? 'outgoing'
            : incoming
              ? 'incoming'
              : 'dimmed',
    );
  }
  return { itemAttention, relationDirections };
}

export const systemMapFieldDimensions = {
  region: { width: territoryWidth, height: territoryHeight },
  file: { width: fileWidth, height: fileHeight },
};
