import { ancestors, description, focusedPartition, node, usefulRoot } from '../facts.js';
import { attention, button, color, element, mark, preserveMapFocus, renderRelations, trail, wireLandmark } from '../bench.js';
import type { Bench } from '../bench.js';
import { hyperbolicGeometry, point, relative, translate } from './model.js';
import type { Point } from './model.js';

export function mountHyperbolic(bench: Bench): () => void {
  const { stage, facts } = bench;
  const points = hyperbolicGeometry(facts);
  const canvas = element('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  const labels = element('div', undefined, 'labels');
  const note = element('div', undefined, 'map-note');
  stage.append(canvas, labels, note);
  let focus = usefulRoot(facts);
  let center = point(points, focus);
  let selected: string | null = null;
  let magnification = 1;
  let suppressClickUntil = 0;

  function render(action: string, start = performance.now()) {
    const width = stage.clientWidth, height = stage.clientHeight;
    const radius = Math.min(width * 0.46, height * 0.46);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    context!.setTransform(dpr, 0, 0, dpr, 0, 0);
    context!.clearRect(0, 0, width, height);
    context!.strokeStyle = '#aab8bc'; context!.lineWidth = 1;
    context!.beginPath(); context!.ellipse(width / 2, height / 2, radius * 1.45, radius, 0, 0, Math.PI * 2); context!.stroke();
    const ids = focusedPartition(facts, focus);
    const active = new Set(ids);
    const contextIds = new Set(ids.flatMap(id => ancestors(facts, id).map(n => n.id)));
    const positions = new Map<string, Point>();
    const distances = new Map<string, number>();
    for (const id of contextIds) {
      const p = relative(point(points, id), center);
      distances.set(id, Math.hypot(p.x, p.y));
      positions.set(id, { x: width / 2 + p.x * radius * 1.45 * magnification, y: height / 2 + p.y * radius * magnification });
    }
    for (const id of contextIds) {
      const n = node(facts, id), p = positions.get(id), parent = n.parentId ? positions.get(n.parentId) : undefined;
      if (!p || !parent) continue;
      context!.strokeStyle = '#9daeb6'; context!.beginPath(); context!.moveTo(parent.x, parent.y); context!.lineTo(p.x, p.y); context!.stroke();
    }
    const { outgoing, incoming } = attention(bench, selected, ids);
    const path = new Set(ancestors(facts, focus).map(n => n.id));
    const priority = [...contextIds].sort((a, b) => {
      const rank = (id: string) => id === focus ? 0 : node(facts, id).parentId === focus ? 1 : path.has(id) ? 2 : 3;
      return rank(a) - rank(b) || a.localeCompare(b);
    });
    let hiddenChildren = 0;
    preserveMapFocus(stage, () => {
      labels.replaceChildren();
      const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
      for (const id of priority) {
        const n = node(facts, id), p = positions.get(id);
        if (!p) continue;
        context!.fillStyle = color(id, selected, outgoing, incoming, n.kind, Boolean(n.workspacePackage));
        context!.strokeStyle = '#45616e';
        context!.beginPath(); context!.arc(p.x, p.y, n.kind === 'file' ? 4 : 7, 0, Math.PI * 2); context!.fill(); context!.stroke();
        const near = id === focus || n.parentId === focus || path.has(id);
        const w = id === focus ? 200 : near ? 158 : 110;
        const h = id === focus ? 62 : near ? 48 : 30;
        const box = { x: p.x - w / 2, y: p.y - h / 2, w, h };
        const fits = box.x >= 0 && box.y >= 0 && box.x + w <= width && box.y + h <= height;
        const collision = occupied.some(b => box.x < b.x + b.w + 4 && box.x + w + 4 > b.x && box.y < b.y + b.h + 3 && box.y + h + 3 > b.y);
        const showLabel = fits && !collision && (near || (distances.get(id) ?? 1) < 0.92);
        if (!showLabel && n.parentId === focus) hiddenChildren++;
        const b = element('button', undefined, `landmark disk-label ${n.kind === 'region' ? 'region-label' : ''}`);
        b.type = 'button'; b.title = `${n.path}\n${description(n)}`;
        b.setAttribute('aria-label', `${n.kind === 'file' ? 'File' : n.workspacePackage ? 'Package' : 'Region'} ${n.path}`);
        b.dataset.kind = n.kind; b.dataset.parent = n.parentId ?? ''; b.dataset.active = String(active.has(id));
        b.dataset.labelVisible = String(showLabel);
        b.style.background = color(id, selected, outgoing, incoming, n.kind, Boolean(n.workspacePackage));
        if (showLabel) {
          occupied.push(box);
          b.append(element('strong', `${n.kind === 'file' ? 'F ' : n.workspacePackage ? 'P ' : ''}${n.label}`));
          if (id === focus) b.append(element('small', n.workspacePackage?.name ?? (n.kind === 'file' ? 'Arquivo direto' : 'Foco · região')));
          Object.assign(b.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${w}px`, height: `${h}px` });
        } else {
          b.textContent = n.kind === 'file' ? '·' : '○';
          Object.assign(b.style, { left: `${Math.max(0, Math.min(width - 24, p.x - 12))}px`, top: `${Math.max(0, Math.min(height - 24, p.y - 12))}px`, width: '24px', height: '24px', padding: '0', minHeight: '24px' });
        }
        wireLandmark(b, id, id => { if (performance.now() > suppressClickUntil) go(id, 'enter'); }, select);
        labels.append(b);
      }
    });
    stage.dataset.hiddenChildLabels = String(hiddenChildren);
    note.textContent = `${hiddenChildren} filhos do foco sem rótulo completo no disco · linhas = containment · arrastar: mover foco · roda: ampliar disco`;
    trail(bench, focus, go, [button('Recentrar foco', () => go(focus, 'recenter'))]);
    renderRelations(bench, selected, ids);
    mark(bench, action, focus, selected, ids, { ...center, magnification }, start);
  }

  function go(id: string, action: string) {
    const start = performance.now();
    focus = action === 'system' ? usefulRoot(facts) : id;
    center = point(points, focus); magnification = 1;
    selected = action === 'system' ? null : id;
    render(action, start); stage.focus({ preventScroll: true });
  }
  function select(id: string) { const start = performance.now(); selected = id; render('select', start); }
  stage.onwheel = event => { event.preventDefault(); const start = performance.now(); magnification = Math.max(0.6, Math.min(2, magnification * Math.exp(-event.deltaY * 0.001))); render('zoom', start); };
  let drag: { x: number; y: number; pointer: number; moved: boolean } | null = null;
  stage.onpointerdown = event => { if (event.button === 0) drag = { x: event.clientX, y: event.clientY, pointer: event.pointerId, moved: false }; };
  stage.onpointermove = event => {
    if (!drag || !event.buttons) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    const start = performance.now(); drag.moved = true; stage.setPointerCapture(drag.pointer);
    const radius = Math.min(stage.clientWidth * .46, stage.clientHeight * .46);
    const shift = { x: -dx / (radius * 1.45 * magnification), y: -dy / (radius * magnification) };
    if (Math.hypot(shift.x, shift.y) < .8) {
      const next = translate(shift, center);
      if (Math.hypot(next.x, next.y) < .99999) center = next;
    }
    drag.x = event.clientX; drag.y = event.clientY;
    render('pan', start);
  };
  stage.onpointerup = () => { if (drag?.moved) suppressClickUntil = performance.now() + 150; drag = null; };
  stage.onpointercancel = () => { drag = null; };
  stage.onkeydown = event => {
    if (event.key === 'Backspace') { event.preventDefault(); const parent = node(facts, focus).parentId; if (parent) go(parent, 'parent'); }
    if (event.key === 'Home') { event.preventDefault(); go(facts.rootId, 'system'); }
    if (event.key === '+' || event.key === '-' || event.key === '=') {
      event.preventDefault(); const start = performance.now(); magnification = Math.max(.6, Math.min(2, magnification * (event.key === '-' ? .8 : 1.25))); render('zoom', start);
    }
  };
  const locate = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === 'string') go(event.detail, 'relation-locate'); };
  stage.addEventListener('locate', locate);
  const observer = new ResizeObserver(() => render('resize')); observer.observe(stage);
  render('load');
  return () => { observer.disconnect(); stage.removeEventListener('locate', locate); };
}
