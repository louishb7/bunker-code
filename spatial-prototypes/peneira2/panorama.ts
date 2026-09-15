import { node } from '../facts.js';
import type { Facts } from '../facts.js';
import { aggregate, contextWindow, place, verifyScene } from './context.js';
import type { Scene } from './context.js';

export function panoramaScene(facts: Facts, focus: string, yaw: number): Scene {
  const n = node(facts, focus);
  const ctx = contextWindow(facts, focus, n.children, Math.round(yaw), 5);
  const places = [place(facts, ctx, focus, 'focus', { x: 355, y: 92, width: 455, height: 90 })];
  const scene: Scene = { context: ctx, places, captions: [{ x: 400, y: 218, text: `ACESSOS DO FOCO · ${ctx.children.length} filhos diretos` }], paths: [
    { kind: 'floor', d: 'M 0 550 Q 572 660 1144 550 L 1144 694 L 0 694 Z' },
    { kind: 'zone', d: 'M 0 258 Q 572 180 1144 258' },
  ] };
  if (n.parentId) places.push(place(facts, ctx, n.parentId, 'parent', { x: 25, y: 95, width: 300, height: 86 }));
  ctx.visibleChildren.forEach((id, i) => {
    const angle = (i - (ctx.visibleChildren.length - 1) / 2) * .32;
    const depth = Math.cos(angle);
    const x = 572 + Math.sin(angle) * 760;
    const top = 300 - depth * 45, bottom = 520 + depth * 45;
    scene.paths.push({ kind: 'floor', d: `M ${x - 88} ${bottom} L ${x - 88} ${top} Q ${x} ${top - 25} ${x + 88} ${top} L ${x + 88} ${bottom}` });
    places.push(place(facts, ctx, id, 'child', { x: x - 96, y: top + 48, width: 192, height: 132 }));
  });
  ctx.siblings.forEach((id, i) => places.push(place(facts, ctx, id, 'sibling', { x: 24 + i * 795, y: 593, width: 305, height: 70 })));
  if (ctx.hiddenSiblings.length && n.parentId) places.push(aggregate(n.parentId, 'siblings', ctx.hiddenSiblings,
    `Retorno por ${node(facts, n.parentId).label} · +${ctx.hiddenSiblings.length} irmãos`, 'parent', { x: 350, y: 593, width: 450, height: 70 }));
  if (ctx.distant.length) places.push(aggregate(facts.rootId, 'distant', ctx.distant,
    `System · ${ctx.distant.length} branches fora daqui`, 'root', { x: 840, y: 95, width: 280, height: 86 }));
  if (ctx.hiddenChildren.length) places.push(aggregate(focus, 'children', ctx.hiddenChildren,
    `${ctx.hiddenChildren.length} acessos fora da vista · girar →`, 'next', { x: 350, y: 493, width: 450, height: 58 }));
  if (!ctx.children.length) scene.captions.push({ x: 415, y: 380, text: n.kind === 'file' ? 'Arquivo · não possui filhos' : 'Nenhum arquivo analisado aqui' });
  verifyScene(facts, scene);
  return scene;
}
