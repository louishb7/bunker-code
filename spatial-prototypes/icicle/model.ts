import { ancestors, node, partition } from '../facts.js';
import type { Facts } from '../facts.js';

export interface Interval { start: number; end: number; depth: number }

export function icicleGeometry(facts: Facts): Map<string, Interval> {
  const intervals = new Map<string, Interval>();
  function visit(id: string, start: number, end: number) {
    const n = node(facts, id);
    intervals.set(id, { start, end, depth: n.depth });
    const weights = n.children.map(child => Math.sqrt(Math.max(1, node(facts, child).files.length)));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = start;
    n.children.forEach((child, i) => {
      const right = i === n.children.length - 1 ? end : x + (end - start) * (weights[i] ?? 0) / total;
      visit(child, x, right);
      x = right;
    });
  }
  visit(facts.rootId, 0, 1);
  return intervals;
}

export function interval(intervals: ReadonlyMap<string, Interval>, id: string): Interval {
  const value = intervals.get(id);
  if (!value) throw new Error(`Missing icicle interval: ${id}`);
  return value;
}

export function iciclePartition(facts: Facts, focus: string): string[] {
  const path = new Set(ancestors(facts, focus).map(n => n.id));
  const focusNode = node(facts, focus);
  return partition(facts, n => path.has(n.id) || (n.depth <= focusNode.depth + 1 && ancestors(facts, n.id).some(a => a.id === focus)));
}
