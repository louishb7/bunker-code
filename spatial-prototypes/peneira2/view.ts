import { ancestors, description, node, usefulRoot } from '../facts.js';
import { attention, button, color, element, mark, preserveMapFocus, renderRelations, trail } from '../bench.js';
import type { Bench } from '../bench.js';
import type { Lens, Place, Scene } from './context.js';
import { skeletonScene } from './skeleton.js';
import { foveatedScene } from './foveated.js';
import { panoramaScene } from './panorama.js';

export function lensScene(bench: Pick<Bench, 'facts'>, lens: Lens, focus: string, offset: number): Scene {
  if (lens === 'hyperbolic-skeleton') return skeletonScene(bench.facts, focus, offset);
  if (lens === 'hyperbolic-foveated') return foveatedScene(bench.facts, focus, offset);
  return panoramaScene(bench.facts, focus, offset);
}

const NS = 'http://www.w3.org/2000/svg';
const roles = { focus: 'VOCÊ ESTÁ AQUI', parent: 'PAI · VOLTAR', child: 'FILHO DIRETO', sibling: 'IRMÃO · MESMO PAI', aggregate: 'CONTEXTO AGRUPADO' };

export function mountLens(bench: Bench, lens: Lens): () => void {
  const { stage, facts } = bench;
  stage.classList.add('lens-stage', lens);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 1160 694');
  svg.setAttribute('preserveAspectRatio', 'none');
  const labels = element('div', undefined, 'lens-labels');
  const path = element('div', undefined, 'lens-path');
  path.setAttribute('aria-label', 'Caminho estrutural no mapa');
  stage.append(svg, labels, path);
  let focus = usefulRoot(facts), selected: string | null = null, offset = 0;
  const windows = new Map<string, number>();
  let scene = lensScene(bench, lens, focus, offset);
  let suppressClickUntil = 0;
  let lastWheel = -Infinity;

  function render(action: string, inputAt = performance.now()) {
    scene = lensScene(bench, lens, focus, offset);
    const { outgoing, incoming } = attention(bench, selected, scene.context.ids);
    svg.replaceChildren();
    for (const line of scene.paths) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', line.d); p.setAttribute('class', `lens-${line.kind}`); svg.append(p);
    }
    for (const caption of scene.captions) {
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(caption.x)); text.setAttribute('y', String(caption.y));
      text.setAttribute('class', 'lens-caption'); text.textContent = caption.text; svg.append(text);
    }
    preserveMapFocus(stage, () => {
      labels.replaceChildren();
      for (const p of scene.places) {
        const n = node(facts, p.id);
        const b = element('button', undefined, `lens-place lens-${p.role}`);
        b.type = 'button'; b.dataset.entity = p.key; b.dataset.role = p.role;
        if (p.role !== 'aggregate') b.dataset.id = p.id;
        b.dataset.destination = p.id;
        b.dataset.members = JSON.stringify(p.members);
        b.dataset.kind = n.kind; b.dataset.parent = n.parentId ?? '';
        b.dataset.labelVisible = 'true';
        b.dataset.aggregate = String(p.role === 'aggregate');
        b.title = p.role === 'aggregate' ? `${p.label}\nAgrupamento de apresentação; não é um módulo. Destino: ${n.path}` : `${n.path}\n${description(n)}`;
        b.setAttribute('aria-label', p.role === 'aggregate' ? p.label ?? 'Contexto' : `${roles[p.role]} · ${description(n)} · ${n.path}`);
        b.append(element('small', roles[p.role]));
        b.append(element('strong', p.label ?? `${n.kind === 'file' ? 'F · ' : n.workspacePackage ? 'P · ' : ''}${n.label}`));
        if (p.role === 'focus') b.append(element('span', n.workspacePackage?.name ?? (n.kind === 'file' ? 'Arquivo · folha' : `${n.children.length} filhos · ${n.files.length} arquivos`), 'lens-facet'));
        const hasOut = p.members.some(id => outgoing.has(id)) || outgoing.has(p.id);
        const hasIn = p.members.some(id => incoming.has(id)) || incoming.has(p.id);
        const fill = color(p.id, selected, hasOut ? new Set([p.id]) : new Set(), hasIn ? new Set([p.id]) : new Set(), n.kind, Boolean(n.workspacePackage));
        b.style.setProperty('--place-color', fill);
        b.dataset.uses = String(hasOut); b.dataset.usedBy = String(hasIn);
        Object.assign(b.style, { left: `${p.x / 11.6}%`, top: `${p.y / 6.94}%`, width: `${p.width / 11.6}%`, height: `${p.height / 6.94}%` });
        b.onclick = event => {
          if (performance.now() < suppressClickUntil) return;
          if (event.shiftKey && p.role !== 'aggregate') select(p.id);
          else activate(p);
        };
        b.onkeydown = event => {
          if (event.key === ' ') { event.preventDefault(); event.stopPropagation(); p.role === 'aggregate' ? activate(p) : select(p.id); }
        };
        labels.append(b);
      }
    });
    path.replaceChildren(element('span', 'CAMINHO · '));
    for (const n of ancestors(facts, focus)) {
      const b = button(`${n.workspacePackage ? 'P · ' : ''}${n.label}`, () => go(n.id, 'ancestor'));
      b.title = `${n.path}\n${description(n)}`;
      path.append(b);
    }
    const count = scene.context.children.length, capacity = scene.context.capacity;
    const range = count ? `${scene.context.offset + 1}–${Math.min(count, scene.context.offset + capacity)} / ${count} filhos` : 'Sem filhos';
    const prev = button(lens === 'wildcard' ? '← Girar' : '← Janela anterior', () => advance(-1, 'disclosure'));
    const next = button(lens === 'wildcard' ? 'Girar →' : 'Próxima janela →', () => advance(1, 'disclosure'));
    prev.dataset.action = 'previous-window'; next.dataset.action = 'next-window';
    prev.disabled = next.disabled = count <= capacity;
    const readout = element('span', range, 'lens-range');
    trail(bench, focus, go, [prev, readout, next]);
    renderRelations(bench, selected, scene.context.ids);
    const counts = { entitiesDrawn: scene.places.length, labelsVisible: scene.places.length,
      aggregates: scene.places.filter(p => p.role === 'aggregate').length,
      contextualWithoutLabel: 0, hiddenChildren: scene.context.hiddenChildren.length,
      childrenDrawn: scene.context.visibleChildren.length, offset: scene.context.offset, capacity };
    for (const [key, value] of Object.entries(counts)) stage.dataset[key] = String(value);
    stage.dataset.logicalFocus = focus;
    mark(bench, action, focus, selected, scene.context.ids, { lens, ...counts }, inputAt);
    stage.dataset.disclosureActions = String(bench.metrics.filter(e => e.action === 'disclosure' || e.action === 'rotate').length + (action === 'disclosure' || action === 'rotate' ? 1 : 0));
  }

  function go(id: string, action: string) {
    const inputAt = performance.now(); windows.set(focus, offset);
    focus = action === 'system' ? usefulRoot(facts) : id;
    offset = action === 'system' ? 0 : windows.get(focus) ?? 0;
    selected = null;
    render(action, inputAt); stage.focus({ preventScroll: true });
  }
  function select(id: string) { const inputAt = performance.now(); selected = id; render('select', inputAt); }
  function activate(p: Place) {
    if (p.action === 'next') advance(1, 'disclosure');
    else go(p.id, p.action === 'parent' ? 'parent' : p.action === 'root' ? 'system' : 'enter');
  }
  function advance(direction: number, action: 'disclosure' | 'rotate') {
    const inputAt = performance.now(), { children, capacity } = scene.context;
    if (children.length <= capacity) return;
    if (lens === 'wildcard' && action === 'rotate') offset = Math.max(0, Math.min(children.length - capacity, offset + direction));
    else {
      const pages = Math.ceil(children.length / capacity);
      offset = ((Math.floor(offset / capacity) + direction + pages) % pages) * capacity;
    }
    windows.set(focus, offset);
    render(action, inputAt); stage.focus({ preventScroll: true });
  }
  stage.onkeydown = event => {
    if (event.key === 'Backspace') { event.preventDefault(); const parent = node(facts, focus).parentId; if (parent) go(parent, 'parent'); }
    if (event.key === 'Home') { event.preventDefault(); go(facts.rootId, 'system'); }
    if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); advance(event.key === 'PageDown' ? 1 : -1, 'disclosure'); }
    if (lens === 'wildcard' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { event.preventDefault(); advance(event.key === 'ArrowRight' ? 1 : -1, 'rotate'); }
  };
  if (lens === 'wildcard') {
    stage.onwheel = event => {
      event.preventDefault(); const now = performance.now();
      if (now - lastWheel < 90) return;
      lastWheel = now; advance(Math.sign(event.deltaX || event.deltaY), 'rotate');
    };
    let drag: { x: number; moved: boolean } | null = null;
    stage.onpointerdown = event => { if (event.button === 0) drag = { x: event.clientX, moved: false }; };
    stage.onpointermove = event => {
      if (!drag || !event.buttons || Math.abs(event.clientX - drag.x) < 50) return;
      stage.setPointerCapture(event.pointerId); drag.moved = true;
      advance(event.clientX < drag.x ? 1 : -1, 'rotate'); drag.x = event.clientX;
    };
    stage.onpointerup = () => { if (drag?.moved) suppressClickUntil = performance.now() + 200; drag = null; };
    stage.onpointercancel = () => { drag = null; };
  }
  const locate = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') { go(event.detail, 'relation-locate'); select(event.detail); }
  };
  stage.addEventListener('locate', locate);
  const observer = new ResizeObserver(() => render('resize')); observer.observe(stage);
  render('load');
  return () => { observer.disconnect(); stage.removeEventListener('locate', locate); };
}
