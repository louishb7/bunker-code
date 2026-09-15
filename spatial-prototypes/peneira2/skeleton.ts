import { node } from '../facts.js';
import type { Facts } from '../facts.js';
import { hyperbolicGeometry, point, relative } from '../hyperbolic/model.js';
import { aggregate, contextWindow, place, verifyScene } from './context.js';
import type { Scene } from './context.js';

export function skeletonOrder(facts: Facts, focus: string): string[] {
  const points = hyperbolicGeometry(facts);
  const center = point(points, focus);
  return [...node(facts, focus).children].sort((a, b) => {
    const p = relative(point(points, a), center), q = relative(point(points, b), center);
    return Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x) || a.localeCompare(b);
  });
}

export function skeletonScene(facts: Facts, focus: string, offset: number): Scene {
  const ctx = contextWindow(facts, focus, skeletonOrder(facts, focus), offset, 10);
  const n = node(facts, focus);
  const places = [place(facts, ctx, focus, 'focus', { x: 38, y: 245, width: 270, height: 120 })];
  const scene: Scene = { context: ctx, places, paths: [], captions: [{ x: 475, y: 88, text: `Filhos diretos · ${ctx.children.length} locais` }] };
  if (n.parentId) {
    places.push(place(facts, ctx, n.parentId, 'parent', { x: 38, y: 105, width: 270, height: 88 }));
    scene.paths.push({ kind: 'containment', d: 'M 173 193 L 173 245' });
  }
  ctx.visibleChildren.forEach((id, i) => {
    const col = i < 5 ? 0 : 1, row = i % 5;
    const x = col ? 810 : 475, y = 105 + row * 102;
    places.push(place(facts, ctx, id, 'child', { x, y, width: 300, height: 88 }));
    scene.paths.push({ kind: 'containment', d: `M 308 305 C ${col ? 400 : 380} 305, ${x - 28} ${y + 44}, ${x} ${y + 44}` });
  });
  ctx.siblings.forEach((id, i) => places.push(place(facts, ctx, id, 'sibling', { x: 38, y: 401 + i * 79, width: 270, height: 70 })));
  if (ctx.hiddenSiblings.length && n.parentId) places.push(aggregate(n.parentId, 'siblings', ctx.hiddenSiblings,
    `${node(facts, n.parentId).label} · ${ctx.hiddenSiblings.length} outros irmãos`, 'parent', { x: 38, y: 559, width: 270, height: 52 }));
  if (ctx.distant.length) places.push(aggregate(facts.rootId, 'distant', ctx.distant,
    `System · ${ctx.distant.length} branches fora deste caminho`, 'root', { x: 38, y: 619, width: 270, height: 52 }));
  if (ctx.hiddenChildren.length) places.push(aggregate(focus, 'children', ctx.hiddenChildren,
    `${ctx.hiddenChildren.length} outros filhos de ${n.label} · próxima janela →`, 'next', { x: 475, y: 621, width: 635, height: 50 }));
  if (!ctx.children.length) scene.captions.push({ x: 475, y: 300, text: n.kind === 'file' ? 'Arquivo · folha do pai indicado' : 'Região sem arquivos analisados' });
  verifyScene(facts, scene);
  return scene;
}
