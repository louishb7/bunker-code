import type { PlannedSystemModel } from '@bunker-code/contracts';
import type { DesignerPresentation } from './designer-storage.js';

export const partSize = { width: 220, height: 112 };

export function partPosition(presentation: DesignerPresentation, id: string, index: number) {
  return (Object.hasOwn(presentation.positions, id) ? presentation.positions[id] : undefined)
    ?? { x: (index % 3) * 320, y: Math.floor(index / 3) * 200 };
}

/** Preserve the effective positions of older documents too, before adding a Part. */
export function positionsForEdit(before: PlannedSystemModel, after: PlannedSystemModel, presentation: DesignerPresentation) {
  const positions: DesignerPresentation['positions'] = Object.fromEntries(before.parts
    .filter((part) => after.parts.some((item) => item.id === part.id))
    .map((part) => [part.id, partPosition(presentation, part.id, before.parts.indexOf(part))]));
  for (const part of after.parts) {
    if (Object.hasOwn(positions, part.id)) continue;
    const occupied = Object.values(positions);
    const origin = occupied.at(-1) ?? { x: -320, y: 0 };
    let point = { x: origin.x + 320, y: origin.y };
    while (occupied.some((other) => Math.abs(other.x - point.x) < partSize.width + 40 && Math.abs(other.y - point.y) < partSize.height + 40)) {
      point = { x: point.x, y: point.y + 180 };
    }
    Object.defineProperty(positions, part.id, { value: point, enumerable: true, writable: true, configurable: true });
  }
  return positions;
}
