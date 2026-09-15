import { node, partition } from '../facts.js';
import type { Facts } from '../facts.js';

export interface Rect { x: number; y: number; width: number; height: number }
export interface Camera { x: number; y: number; k: number }

export function atlasGeometry(facts: Facts): Map<string, Rect> {
  const boxes = new Map<string, Rect>();
  function place(id: string, box: Rect) {
    boxes.set(id, box);
    const children = node(facts, id).children;
    const inset = Math.min(box.width, box.height) * 0.025;
    const content = { x: box.x + inset, y: box.y + box.height * 0.10,
      width: box.width - inset * 2, height: box.height * 0.90 - inset };
    function divide(ids: readonly string[], area: Rect) {
      if (!ids.length) return;
      if (ids.length === 1) { place(ids[0] ?? '', area); return; }
      const weights = ids.map(child => Math.sqrt(Math.max(1, node(facts, child).files.length)));
      const total = weights.reduce((a, b) => a + b, 0);
      let index = 1;
      let sum = weights[0] ?? 1;
      while (index < ids.length - 1 && sum + (weights[index] ?? 0) / 2 < total / 2) sum += weights[index++] ?? 0;
      const ratio = sum / total;
      const gap = Math.min(area.width, area.height) * 0.014;
      if (area.width >= area.height) {
        const width = (area.width - gap) * ratio;
        divide(ids.slice(0, index), { ...area, width });
        divide(ids.slice(index), { ...area, x: area.x + width + gap, width: area.width - width - gap });
      } else {
        const height = (area.height - gap) * ratio;
        divide(ids.slice(0, index), { ...area, height });
        divide(ids.slice(index), { ...area, y: area.y + height + gap, height: area.height - height - gap });
      }
    }
    divide(children, content);
  }
  place(facts.rootId, { x: 0, y: 0, width: 1200, height: 760 });
  return boxes;
}

export function rect(boxes: ReadonlyMap<string, Rect>, id: string): Rect {
  const box = boxes.get(id);
  if (!box) throw new Error(`Missing atlas rectangle: ${id}`);
  return box;
}

export function fit(box: Rect, width: number, height: number): Camera {
  const k = Math.min((width - 50) / box.width, (height - 50) / box.height);
  return { k, x: width / 2 - (box.x + box.width / 2) * k, y: height / 2 - (box.y + box.height / 2) * k };
}

export function screen(box: Rect, camera: Camera): Rect {
  return { x: box.x * camera.k + camera.x, y: box.y * camera.k + camera.y,
    width: box.width * camera.k, height: box.height * camera.k };
}

export function atlasPartition(facts: Facts, boxes: ReadonlyMap<string, Rect>, camera: Camera): string[] {
  return partition(facts, n => {
    if (n.id === facts.rootId) return true;
    const box = screen(rect(boxes, n.id), camera);
    return box.width >= 550 && box.height >= 300 && n.children.every(id => {
      const child = screen(rect(boxes, id), camera);
      return child.width >= 42 && child.height >= 28;
    });
  });
}

export function zoomAt(camera: Camera, factor: number, x: number, y: number): Camera {
  const k = Math.max(0.1, Math.min(100000, camera.k * factor));
  return { k, x: x - (x - camera.x) * k / camera.k, y: y - (y - camera.y) * k / camera.k };
}

