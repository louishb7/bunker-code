import { description, node, usefulRoot } from '../facts.js';
import { attention, button, color, element, mark, preserveMapFocus, renderRelations, trail } from '../bench.js';
import type { Bench } from '../bench.js';
import { icicleGeometry, iciclePartition, interval } from './model.js';

const NS = 'http://www.w3.org/2000/svg';

export function mountIcicle(bench: Bench): () => void {
  const { facts, stage } = bench;
  const intervals = icicleGeometry(facts);
  const svg = document.createElementNS(NS, 'svg');
  const note = element('div', undefined, 'map-note');
  stage.append(svg, note);
  let focus = usefulRoot(facts);
  let selected: string | null = null;
  let startX = interval(intervals, focus).start;
  let endX = interval(intervals, focus).end;
  let suppressClickUntil = 0;

  function render(action: string, start = performance.now()) {
    const width = stage.clientWidth, height = stage.clientHeight;
    svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
    const firstDepth = Math.max(0, node(facts, focus).depth - 1);
    const rowHeight = Math.min(145, (height - 55) / 4);
    const ids = iciclePartition(facts, focus);
    const active = new Set(ids);
    const { outgoing, incoming } = attention(bench, selected, ids);
    let croppedChildren = 0;
    preserveMapFocus(stage, () => {
      svg.replaceChildren();
      for (const n of facts.nodes.values()) {
        const range = interval(intervals, n.id);
        if (range.depth < firstDepth || range.depth > firstDepth + 3) continue;
        const x = 50 + (range.start - startX) / (endX - startX) * (width - 70);
        const right = 50 + (range.end - startX) / (endX - startX) * (width - 70);
        const w = right - x;
        if (n.parentId === focus && (w < Math.min(240, n.label.length * 7 + 16) || x < 50 || right > width - 20)) croppedChildren++;
        if (right < 50 || x > width || w < 1) continue;
        const y = 28 + (range.depth - firstDepth) * rowHeight;
        const group = document.createElementNS(NS, 'g');
        group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button');
        group.setAttribute('aria-label', `${n.kind === 'file' ? 'File' : n.workspacePackage ? 'Package' : 'Region'} ${n.path}`);
        group.dataset.id = n.id; group.dataset.parent = n.parentId ?? ''; group.dataset.kind = n.kind;
        group.dataset.active = String(active.has(n.id));
        group.dataset.labelVisible = String(w >= n.label.length * 7 + 16);
        const title = document.createElementNS(NS, 'title'); title.textContent = `${n.path}\n${description(n)}`;
        const box = document.createElementNS(NS, 'rect');
        box.setAttribute('x', String(x + 1)); box.setAttribute('y', String(y));
        box.setAttribute('width', String(Math.max(0, w - 2))); box.setAttribute('height', String(rowHeight - 6));
        box.setAttribute('fill', color(n.id, selected, outgoing, incoming, n.kind, Boolean(n.workspacePackage)));
        box.setAttribute('stroke', n.workspacePackage ? '#827046' : '#8da4ac');
        box.setAttribute('stroke-width', n.workspacePackage ? '2' : '1');
        group.append(title, box);
        if (w >= 25) {
          const text = document.createElementNS(NS, 'foreignObject');
          text.setAttribute('x', String(Math.max(50, x + 1))); text.setAttribute('y', String(y));
          text.setAttribute('width', String(Math.max(0, Math.min(width, right) - Math.max(50, x) - 3))); text.setAttribute('height', String(rowHeight - 6));
          const label = element('div', undefined, 'icicle-label');
          label.append(element('strong', `${n.kind === 'file' ? 'F ' : n.workspacePackage ? 'P ' : ''}${n.label}`));
          if (w > 140) label.append(element('small', n.workspacePackage?.name ?? (n.kind === 'file' ? 'Arquivo direto no pai' : 'Região')));
          text.append(label); group.append(text);
        }
        group.addEventListener('click', event => { if (performance.now() > suppressClickUntil) event.shiftKey ? select(n.id) : go(n.id, 'enter'); });
        group.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); event.key === ' ' ? select(n.id) : go(n.id, 'enter'); }
        });
        svg.append(group);
      }
      for (let row = 0; row < 4; row++) {
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', '8'); label.setAttribute('y', String(50 + row * rowHeight));
        label.setAttribute('font-size', '12'); label.textContent = `d ${firstDepth + row}`; svg.append(label);
      }
    });
    stage.dataset.croppedChildLabels = String(croppedChildren);
    note.textContent = `Y = profundidade factual · ${croppedChildren} filhos com largura limitada/fora da janela · roda: zoom X · arrastar/setas: pan X`;
    trail(bench, focus, go, [button('− X', () => zoom(.8, .5)), button('+ X', () => zoom(1.25, .5)), button('Enquadrar foco', () => go(focus, 'recenter'))]);
    renderRelations(bench, selected, ids);
    mark(bench, action, focus, selected, ids, { startX, endX, firstDepth }, start);
  }

  function go(id: string, action: string) {
    const start = performance.now(); focus = action === 'system' ? usefulRoot(facts) : id;
    selected = action === 'system' ? null : id;
    const range = interval(intervals, focus); startX = range.start; endX = range.end;
    render(action, start); stage.focus({ preventScroll: true });
  }
  function select(id: string) { const start = performance.now(); selected = id; render('select', start); }
  function zoom(factor: number, anchor: number) {
    const start = performance.now(); const length = endX - startX;
    const next = Math.min(2, Math.max(0.000001, length / factor));
    const x = startX + length * anchor;
    startX = x - next * anchor; endX = startX + next; render('zoom', start);
  }
  stage.onwheel = event => { event.preventDefault(); const box = stage.getBoundingClientRect(); zoom(Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * .002), (event.clientX - box.left) / stage.clientWidth); };
  let drag: { x: number; pointer: number; moved: boolean } | null = null;
  stage.onpointerdown = event => { if (event.button === 0) drag = { x: event.clientX, pointer: event.pointerId, moved: false }; };
  stage.onpointermove = event => {
    if (!drag || !event.buttons) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    const start = performance.now(); drag.moved = true; stage.setPointerCapture(drag.pointer);
    const shift = -dx / (stage.clientWidth - 70) * (endX - startX);
    startX += shift; endX += shift; drag.x = event.clientX; render('pan', start);
  };
  stage.onpointerup = () => { if (drag?.moved) suppressClickUntil = performance.now() + 150; drag = null; };
  stage.onpointercancel = () => { drag = null; };
  stage.onkeydown = event => {
    if (event.key === 'Backspace') { event.preventDefault(); const parent = node(facts, focus).parentId; if (parent) go(parent, 'parent'); }
    if (event.key === 'Home') { event.preventDefault(); go(facts.rootId, 'system'); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25, .5); }
    if (event.key === '-') { event.preventDefault(); zoom(.8, .5); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); const start = performance.now(); const dx = (endX - startX) * (event.key === 'ArrowLeft' ? -.1 : .1);
      startX += dx; endX += dx; render('pan', start);
    }
  };
  const locate = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === 'string') go(event.detail, 'relation-locate'); };
  stage.addEventListener('locate', locate);
  const observer = new ResizeObserver(() => render('resize')); observer.observe(stage);
  render('load');
  return () => { observer.disconnect(); stage.removeEventListener('locate', locate); };
}
