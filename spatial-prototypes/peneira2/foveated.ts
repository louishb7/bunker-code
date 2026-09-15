import { node } from '../facts.js';
import type { Facts } from '../facts.js';
import { aggregate, contextWindow, place, verifyScene } from './context.js';
import type { Scene } from './context.js';

export function foveatedScene(facts: Facts, focus: string, offset: number): Scene {
  const n = node(facts, focus), ctx = contextWindow(facts, focus, n.children, offset, 8);
  const places = [place(facts, ctx, focus, 'focus', { x: 431, y: 321, width: 280, height: 112 })];
  const scene: Scene = { context: ctx, places, captions: [
    { x: 470, y: 292, text: 'CENTRO · você está aqui' },
    { x: 420, y: 198, text: `ZONA INTERNA · ${ctx.children.length} filhos diretos` },
    { x: 25, y: 91, text: 'EXTERIOR · retorno' }, { x: 620, y: 91, text: 'CONTEXTO · irmãos do foco' },
  ], paths: [{ kind: 'zone', d: 'M 960 382 A 388 186 0 1 1 184 382 A 388 186 0 1 1 960 382' }] };
  if (n.parentId) places.push(place(facts, ctx, n.parentId, 'parent', { x: 25, y: 108, width: 295, height: 70 }));
  ctx.siblings.forEach((id, i) => places.push(place(facts, ctx, id, 'sibling', { x: 620 + i * 252, y: 108, width: 240, height: 70 })));
  const slots = [
    [190, 210], [660, 210], [45, 316], [865, 316],
    [45, 422], [865, 422], [190, 528], [660, 528],
  ];
  ctx.visibleChildren.forEach((id, i) => {
    const [x, y] = slots[i] ?? [0, 0];
    places.push(place(facts, ctx, id, 'child', { x: x ?? 0, y: y ?? 0, width: 270, height: 88 }));
  });
  if (ctx.hiddenSiblings.length && n.parentId) places.push(aggregate(n.parentId, 'siblings', ctx.hiddenSiblings,
    `Pai · +${ctx.hiddenSiblings.length} irmãos`, 'parent', { x: 325, y: 108, width: 275, height: 70 }));
  if (ctx.distant.length) places.push(aggregate(facts.rootId, 'distant', ctx.distant,
    `System · ${ctx.distant.length} branches distantes`, 'root', { x: 25, y: 636, width: 310, height: 40 }));
  if (ctx.hiddenChildren.length) places.push(aggregate(focus, 'children', ctx.hiddenChildren,
    `${ctx.hiddenChildren.length} outros filhos de ${n.label} · próximo setor →`, 'next', { x: 370, y: 636, width: 765, height: 40 }));
  verifyScene(facts, scene);
  return scene;
}
