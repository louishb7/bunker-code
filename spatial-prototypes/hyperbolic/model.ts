import { node } from '../facts.js';
import type { Facts } from '../facts.js';

export interface Point { x: number; y: number }

// (z + a) / (1 + conjugate(a) * z): an isometry of the unit disk.
export function translate(z: Point, a: Point): Point {
  const dr = 1 + a.x * z.x + a.y * z.y;
  const di = a.x * z.y - a.y * z.x;
  const nr = z.x + a.x;
  const ni = z.y + a.y;
  const denominator = dr * dr + di * di;
  return { x: (nr * dr + ni * di) / denominator, y: (ni * dr - nr * di) / denominator };
}

export function hyperbolicGeometry(facts: Facts): Map<string, Point> {
  const points = new Map<string, Point>();
  function visit(id: string, p: Point, direction: number) {
    points.set(id, p);
    const children = node(facts, id).children;
    const span = id === facts.rootId ? Math.PI * 2 : Math.PI * 1.65;
    children.forEach((child, i) => {
      const angle = direction - span / 2 + span * (i + 0.5) / children.length;
      const local = { x: Math.cos(angle) * 0.68, y: Math.sin(angle) * 0.68 };
      visit(child, translate(local, p), angle);
    });
  }
  visit(facts.rootId, { x: 0, y: 0 }, 0);
  return points;
}

export function point(points: ReadonlyMap<string, Point>, id: string): Point {
  const p = points.get(id);
  if (!p) throw new Error(`Missing hyperbolic point: ${id}`);
  return p;
}

export function relative(p: Point, focus: Point): Point {
  return translate(p, { x: -focus.x, y: -focus.y });
}

