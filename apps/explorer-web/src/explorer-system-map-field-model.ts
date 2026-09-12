import type {
  ExplorerSystemMapItem,
  ExplorerSystemMapProjection,
  ExplorerSystemMapRelation,
} from './explorer-system-map-projection.js';

export type SystemMapFieldRelationDirection = 'outgoing' | 'incoming';
export type SystemMapFieldHandleSide = 'top' | 'right' | 'bottom' | 'left';
export type SystemMapFieldItemAttention = 'selected' | 'outgoing' | 'incoming' | 'both' | 'dimmed' | 'resting';

export interface SystemMapFieldItemPlacement {
  item: ExplorerSystemMapItem;
  position: { x: number; y: number };
}

export interface SystemMapFieldModel {
  items: SystemMapFieldItemPlacement[];
  relations: ExplorerSystemMapRelation[];
  directFilesBand: null | { position: { x: number; y: number }; width: number; height: number };
}

export interface SystemMapFieldSelection {
  itemAttention: Map<string, SystemMapFieldItemAttention>;
  relationDirections: Map<string, SystemMapFieldRelationDirection>;
}

const territoryWidth = 224;
const territoryHeight = 104;
const territoryColumnGap = 70;
const territoryRowGap = 58;
const territoryColumns = 4;
const fileWidth = 174;
const fileHeight = 62;
const fileGap = 16;
const bandInset = 20;
const bandHeaderHeight = 34;

export function createSystemMapFieldModel(
  projection: Extract<ExplorerSystemMapProjection, { status: 'ready' }>,
): SystemMapFieldModel {
  const territories = projection.items.filter((item) => item.kind === 'territory');
  const directFiles = projection.items.filter((item) => item.kind === 'file');
  const columns = Math.min(territoryColumns, Math.max(territories.length, 1));
  const territoryRows = Math.ceil(territories.length / columns);
  const fieldWidth = columns * territoryWidth + Math.max(0, columns - 1) * territoryColumnGap;
  const territoryPlacements = territories.map((item, index): SystemMapFieldItemPlacement => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowItemCount = Math.min(columns, territories.length - row * columns);
    const rowWidth = rowItemCount * territoryWidth + Math.max(0, rowItemCount - 1) * territoryColumnGap;
    const rowOffset = (fieldWidth - rowWidth) / 2;
    return {
      item,
      position: {
        x: rowOffset + column * (territoryWidth + territoryColumnGap),
        y: row * (territoryHeight + territoryRowGap) + (column % 2) * 12,
      },
    };
  });
  const territoryBottom = territoryRows === 0
    ? 0
    : (territoryRows - 1) * (territoryHeight + territoryRowGap) + territoryHeight + 12;
  const fileRowWidth = directFiles.length * fileWidth + Math.max(0, directFiles.length - 1) * fileGap;
  const bandWidth = Math.max(fileRowWidth + bandInset * 2, 320);
  const bandX = Math.max(0, (fieldWidth - bandWidth) / 2);
  const bandY = territoryBottom + (territories.length > 0 ? 56 : 0);
  const filePlacements = directFiles.map((item, index): SystemMapFieldItemPlacement => ({
    item,
    position: {
      x: bandX + bandInset + index * (fileWidth + fileGap),
      y: bandY + bandHeaderHeight,
    },
  }));

  return {
    items: [...territoryPlacements, ...filePlacements],
    relations: projection.relations,
    directFilesBand: directFiles.length === 0 ? null : {
      position: { x: bandX, y: bandY },
      width: bandWidth,
      height: bandHeaderHeight + fileHeight + bandInset,
    },
  };
}

export function createSystemMapFieldRelationRoute(
  model: SystemMapFieldModel,
  relation: ExplorerSystemMapRelation,
): { sourceSide: SystemMapFieldHandleSide; targetSide: SystemMapFieldHandleSide } {
  const source = model.items.find(({ item }) => item.id === relation.sourceItemId);
  const target = model.items.find(({ item }) => item.id === relation.targetItemId);
  if (!source || !target) throw new Error('Territory Field relation references an unknown item: ' + relation.id);
  const sourceDimensions = systemMapFieldDimensions[source.item.kind];
  const targetDimensions = systemMapFieldDimensions[target.item.kind];
  const sourceCenter = {
    x: source.position.x + sourceDimensions.width / 2,
    y: source.position.y + sourceDimensions.height / 2,
  };
  const targetCenter = {
    x: target.position.x + targetDimensions.width / 2,
    y: target.position.y + targetDimensions.height / 2,
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
  territory: { width: territoryWidth, height: territoryHeight },
  file: { width: fileWidth, height: fileHeight },
};
