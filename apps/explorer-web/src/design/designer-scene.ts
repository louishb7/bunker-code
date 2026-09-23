import type { PlannedSystemModel } from '@bunker-code/contracts';
import { partPosition, dimensionsForLens } from './designer-layout.js';
import { technologiesForPart, type DesignImplementation } from './designer-implementation.js';
import type { DesignerPresentation } from './designer-storage.js';

export function shortLabel(label: string, maximum: number): string {
  const chars = Array.from(label);
  return chars.length > maximum ? chars.slice(0, maximum - 1).join('') + '…' : label;
}
export function technologyBadges(labels: string[]) {
  const shown = labels.length > 3 ? [...labels.slice(0, 3), `+${labels.length - 3}`] : labels;
  let x = 18; let y = 91;
  return shown.map((label) => {
    const text = shortLabel(label, 23);
    const width = Math.min(184, Array.from(text).length * 7 + 18);
    if (x + width > 202) { x = 18; y += 23; }
    const badge = { label, text, x, y, width }; x += width + 5;
    return badge;
  });
}

export function relationGeometry(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number, self: boolean, routeTop?: number) {
  let path: string; let x: number; let y: number;
  let xs: number[]; let ys: number[];
  if (self) {
    const top = sourceY - 110 - lane * 44;
    xs = [sourceX, sourceX + 90, targetX - 90, targetX]; ys = [sourceY, top, targetY];
    path = `M ${sourceX} ${sourceY} C ${sourceX + 90} ${top}, ${targetX - 90} ${top}, ${targetX} ${targetY}`;
    x = (sourceX + targetX) / 2; y = sourceY + (top - sourceY) * 0.75;
  } else if (routeTop !== undefined || targetX < sourceX) {
    const top = routeTop ?? Math.min(sourceY, targetY) - 100 - (Math.abs(lane) * 2 + (lane < 0 ? 1 : 0)) * 56;
    if (targetX > sourceX) {
      const bend = Math.min(48, (targetX - sourceX) / 4);
      xs = [sourceX, sourceX + bend * 2, targetX - bend * 2, targetX];
      path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${sourceX + bend} ${top}, ${sourceX + bend * 2} ${top} L ${targetX - bend * 2} ${top} C ${targetX - bend} ${top}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`;
    } else {
      xs = [sourceX, sourceX + 90, targetX - 90, targetX];
      path = `M ${sourceX} ${sourceY} C ${sourceX + 90} ${sourceY}, ${sourceX + 90} ${top}, ${sourceX} ${top} L ${targetX} ${top} C ${targetX - 90} ${top}, ${targetX - 90} ${targetY}, ${targetX} ${targetY}`;
    }
    ys = [sourceY, top, targetY];
    x = (sourceX + targetX) / 2; y = top;
  } else {
    const middleX = (sourceX + targetX) / 2;
    const offset = lane * 56;
    const bend = Math.max(80, Math.abs(targetX - sourceX) * 0.45);
    xs = [sourceX, sourceX + bend, targetX - bend, targetX];
    ys = [sourceY, sourceY + offset, targetY + offset, targetY];
    path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY + offset}, ${targetX - bend} ${targetY + offset}, ${targetX} ${targetY}`;
    x = middleX; y = (sourceY + targetY) / 2 + offset * 0.75;
  }
  return { path, x, y, curveBounds: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) } };
}

export function buildDesignerScene(model: PlannedSystemModel, presentation: DesignerPresentation, implementation: DesignImplementation) {
  const partSize = dimensionsForLens(presentation);
  const parts = model.parts.map((part, index) => {
    const technologies = technologiesForPart(implementation, part.id).map((item) => item.label);
    return { ...part, position: partPosition(presentation, part.id, index), technologies, badges: technologyBadges(technologies) };
  });
  const labels: { x: number; y: number; width: number }[] = [];
  const relations = model.relations.map((relation) => {
    const siblings = model.relations.filter((item) => (item.sourcePartId === relation.sourcePartId && item.targetPartId === relation.targetPartId) || (item.sourcePartId === relation.targetPartId && item.targetPartId === relation.sourcePartId));
    const index = siblings.findIndex((item) => item.id === relation.id);
    const lane = relation.sourcePartId === relation.targetPartId ? index : index - (siblings.length - 1) / 2;
    const self = relation.sourcePartId === relation.targetPartId;
    const source = partPosition(presentation, relation.sourcePartId, model.parts.findIndex((part) => part.id === relation.sourcePartId));
    const target = partPosition(presentation, relation.targetPartId, model.parts.findIndex((part) => part.id === relation.targetPartId));
    const corridor = model.parts.map((part, index) => ({ id: part.id, ...partPosition(presentation, part.id, index) }))
      .filter((point) => point.id !== relation.sourcePartId && point.id !== relation.targetPartId)
      .filter((point) => point.x + partSize.width > Math.min(source.x + partSize.width, target.x) && point.x < Math.max(source.x + partSize.width, target.x));
    const obstructed = corridor.some((point) => point.y < Math.max(source.y, target.y) + partSize.height && point.y + partSize.height > Math.min(source.y, target.y));
    const routeTop = !self && (target.x < source.x + partSize.width || obstructed)
      ? Math.min(source.y, target.y, ...corridor.map((point) => point.y)) - 64 - (Math.abs(lane) * 2 + (lane < 0 ? 1 : 0)) * 40
      : undefined;
    const label = model.predicates.find((item) => item.id === relation.predicateId)?.label ?? '';
    const anchor = relationGeometry(source.x + partSize.width, source.y + partSize.height / 2, target.x, target.y + partSize.height / 2, lane, self, routeTop);
    const width = Math.min(190, label.length * 7 + 20);
    let labelOffset = 0;
    while (labels.some((other) => Math.abs(other.x - anchor.x) < (width + other.width) / 2 + 8 && Math.abs(other.y - anchor.y - labelOffset) < 32)) labelOffset -= 32;
    labels.push({ x: anchor.x, y: anchor.y + labelOffset, width });
    return {
      id: relation.id, type: 'plannedRelation', source: relation.sourcePartId, target: relation.targetPartId,
      label, lane, self, labelOffset, routeTop, ...anchor, labelY: anchor.y + labelOffset,
      // Bézier curves stay inside their control-point hull. Include displaced labels too.
      bounds: { left: Math.min(anchor.curveBounds.left, anchor.x - width / 2) - 16,
        right: Math.max(anchor.curveBounds.right, anchor.x + width / 2) + 16,
        top: Math.min(anchor.curveBounds.top, anchor.y + labelOffset - 16),
        bottom: Math.max(anchor.curveBounds.bottom, anchor.y + labelOffset + 16) },
    };
  });
  return { parts, relations, partSize };
}
