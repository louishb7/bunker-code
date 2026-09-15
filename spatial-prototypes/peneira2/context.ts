import { ancestors, focusedPartition, node } from '../facts.js';
import type { Facts } from '../facts.js';

export type Lens = 'hyperbolic-skeleton' | 'hyperbolic-foveated' | 'wildcard';
export interface WindowContext {
  focus: string;
  ids: string[];
  path: string[];
  children: string[];
  visibleChildren: string[];
  hiddenChildren: string[];
  siblings: string[];
  hiddenSiblings: string[];
  distant: string[];
  offset: number;
  capacity: number;
}

export function contextWindow(facts: Facts, focus: string, orderedChildren: readonly string[], offset: number, capacity: number): WindowContext {
  const n = node(facts, focus);
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid label capacity');
  if (!Number.isFinite(offset)) throw new Error('Invalid window offset');
  if (JSON.stringify([...orderedChildren].sort()) !== JSON.stringify([...n.children].sort())) throw new Error('Window must contain exactly the factual direct children');
  const start = Math.max(0, Math.min(Math.max(0, orderedChildren.length - 1), Math.floor(offset)));
  const children = [...orderedChildren];
  const visibleChildren = children.slice(start, start + capacity);
  const visibleSet = new Set(visibleChildren);
  const siblings = n.parentId ? node(facts, n.parentId).children.filter(id => id !== focus) : [];
  const visibleSiblings = siblings.slice(0, 2);
  const ids = focusedPartition(facts, focus);
  const near = new Set([focus, ...children, ...siblings]);
  return { focus, ids, path: ancestors(facts, focus).map(a => a.id), children,
    visibleChildren, hiddenChildren: children.filter(id => !visibleSet.has(id)),
    siblings: visibleSiblings, hiddenSiblings: siblings.slice(2), distant: ids.filter(id => !near.has(id)),
    offset: start, capacity };
}

export interface Shape { x: number; y: number; width: number; height: number }
export interface Place extends Shape {
  key: string;
  id: string;
  role: 'focus' | 'parent' | 'child' | 'sibling' | 'aggregate';
  members: string[];
  label?: string;
  action?: 'next' | 'parent' | 'root';
}
export interface Scene {
  places: Place[];
  paths: Array<{ d: string; kind: 'containment' | 'zone' | 'floor' }>;
  captions: Array<{ x: number; y: number; text: string }>;
  context: WindowContext;
}

export function place(facts: Facts, ctx: WindowContext, id: string, role: Place['role'], shape: Shape): Place {
  node(facts, id);
  return { key: `${role}:${id}`, id, role, ...shape, members: ctx.ids.includes(id) ? [id] : [] };
}

export function aggregate(id: string, key: string, members: string[], label: string, action: Place['action'], shape: Shape): Place {
  return { key, id, role: 'aggregate', members, label, action, ...shape };
}

export function verifyScene(facts: Facts, scene: Scene) {
  const membership = scene.places.flatMap(p => p.members).sort();
  if (JSON.stringify(membership) !== JSON.stringify([...scene.context.ids].sort())) throw new Error('Drawn locations and aggregates must partition the logical frontier');
  for (const p of scene.places) {
    node(facts, p.id);
    if (![p.x, p.y, p.width, p.height].every(Number.isFinite) || p.width <= 0 || p.height <= 0) throw new Error('Invalid scene geometry');
  }
}
