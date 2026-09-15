import { ancestors, description, node } from '../facts.js';
import { attention, button, color, element, mark, preserveMapFocus, renderRelations, trail, wireLandmark } from '../bench.js';
import type { Bench } from '../bench.js';
import { atlasGeometry, atlasPartition, fit, rect, screen, zoomAt } from './model.js';
import type { Camera } from './model.js';

export function mountAtlas(bench: Bench): () => void {
  const { facts, stage } = bench;
  const boxes = atlasGeometry(facts);
  const canvas = element('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  const labels = element('div', undefined, 'labels');
  stage.append(canvas, labels, element('div', 'Roda: aproximar/afastar · arrastar: pan · +/−: zoom · setas: pan', 'map-note'));
  let focus = facts.rootId;
  let selected: string | null = null;
  let camera: Camera = fit(rect(boxes, focus), stage.clientWidth, stage.clientHeight);
  let suppressClickUntil = 0;

  function render(action: string, start = performance.now()) {
    const width = stage.clientWidth, height = stage.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    context!.setTransform(dpr, 0, 0, dpr, 0, 0);
    context!.clearRect(0, 0, width, height);
    const ids = atlasPartition(facts, boxes, camera);
    const active = new Set(ids);
    const contexts = new Set(ids.flatMap(id => ancestors(facts, id).slice(0, -1).map(n => n.id)));
    const { outgoing, incoming } = attention(bench, selected, ids);
    preserveMapFocus(stage, () => {
      labels.replaceChildren();
      for (const id of [...contexts, ...ids]) {
        const n = node(facts, id);
        const box = screen(rect(boxes, id), camera);
        if (box.x > width || box.y > height || box.x + box.width < 0 || box.y + box.height < 0) continue;
        const isActive = active.has(id);
        context!.fillStyle = isActive ? color(id, selected, outgoing, incoming, n.kind, Boolean(n.workspacePackage)) : '#e2e9e9';
        context!.strokeStyle = n.workspacePackage ? '#827046' : '#8da4ac';
        context!.lineWidth = n.workspacePackage ? 2 : 1;
        context!.fillRect(box.x, box.y, box.width, box.height);
        context!.strokeRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2);
        const labelHeight = isActive ? box.height : Math.min(34, box.height * 0.09);
        if (box.width < 36 || labelHeight < 20 || (!isActive && box.y < -10)) continue;
        const b = element('button', undefined, `landmark ${n.kind === 'region' ? 'region-label' : ''}`);
        b.type = 'button';
        b.title = `${n.path}\n${description(n)}`;
        b.setAttribute('aria-label', `${n.kind === 'file' ? 'File' : n.workspacePackage ? 'Package' : 'Region'} ${n.path}`);
        b.dataset.kind = n.kind;
        b.dataset.parent = n.parentId ?? '';
        b.dataset.active = String(isActive);
        b.append(element('strong', `${n.kind === 'file' ? 'F ' : n.workspacePackage ? 'P ' : ''}${n.label}`));
        if (isActive && box.height > 75) b.append(element('small', n.workspacePackage?.name ?? (n.kind === 'file' ? 'Arquivo direto no pai' : `${n.children.length} filhos · ${n.files.length} arquivos`)));
        const left = Math.max(0, box.x), top = Math.max(0, box.y);
        Object.assign(b.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(0, Math.min(width, box.x + box.width) - left)}px`,
          height: `${Math.max(0, Math.min(height, box.y + labelHeight) - top)}px` });
        wireLandmark(b, id, id => { if (performance.now() > suppressClickUntil) go(id, 'enter'); }, select);
        labels.append(b);
      }
    });
    const plus = button('+', () => zoom(1.35, width / 2, height / 2));
    const minus = button('−', () => zoom(1 / 1.35, width / 2, height / 2));
    const reset = button('Enquadrar foco', () => go(focus, 'recenter'));
    trail(bench, focus, go, [plus, minus, reset]);
    renderRelations(bench, selected, ids);
    mark(bench, action, focus, selected, ids, camera, start);
  }

  function go(id: string, action: string) {
    const start = performance.now();
    focus = id; selected = action === 'system' ? null : id;
    const box = rect(boxes, id);
    camera = fit(box, stage.clientWidth, stage.clientHeight);
    if (node(facts, id).children.length && action !== 'system') {
      const k = Math.max(camera.k, 551 / box.width, 301 / box.height,
        ...node(facts, id).children.flatMap(child => [43 / rect(boxes, child).width, 29 / rect(boxes, child).height]));
      camera = { k, x: stage.clientWidth / 2 - (box.x + box.width / 2) * k, y: stage.clientHeight / 2 - (box.y + box.height / 2) * k };
    }
    render(action, start);
    stage.focus({ preventScroll: true });
  }

  function select(id: string) { const start = performance.now(); selected = id; render('select', start); }

  function updateCameraFocus() {
    const x = (stage.clientWidth / 2 - camera.x) / camera.k;
    const y = (stage.clientHeight / 2 - camera.y) / camera.k;
    const candidates = [...facts.nodes.values()].filter(n => {
      if (n.kind === 'file') return false;
      const b = rect(boxes, n.id);
      return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
        && b.width * camera.k >= stage.clientWidth * 0.55 && b.height * camera.k >= stage.clientHeight * 0.5;
    }).sort((a, b) => b.depth - a.depth);
    focus = candidates[0]?.id ?? facts.rootId;
  }

  function zoom(factor: number, x: number, y: number) {
    const start = performance.now(); camera = zoomAt(camera, factor, x, y); updateCameraFocus(); render('zoom', start);
  }
  stage.onwheel = event => {
    event.preventDefault();
    const box = stage.getBoundingClientRect();
    zoom(Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * 0.003), event.clientX - box.left, event.clientY - box.top);
  };
  let drag: { x: number; y: number; pointer: number; moved: boolean } | null = null;
  stage.onpointerdown = event => { if (event.button === 0) drag = { x: event.clientX, y: event.clientY, pointer: event.pointerId, moved: false }; };
  stage.onpointermove = event => {
    if (!drag || !event.buttons) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    const start = performance.now(); drag.moved = true; stage.setPointerCapture(drag.pointer);
    camera = { ...camera, x: camera.x + dx, y: camera.y + dy };
    drag.x = event.clientX; drag.y = event.clientY;
    updateCameraFocus(); render('pan', start);
  };
  stage.onpointerup = () => { if (drag?.moved) suppressClickUntil = performance.now() + 150; drag = null; };
  stage.onpointercancel = () => { drag = null; };
  stage.onkeydown = event => {
    if (event.key === 'Backspace') { event.preventDefault(); const parent = node(facts, focus).parentId; if (parent) go(parent, 'parent'); }
    if (event.key === 'Home') { event.preventDefault(); go(facts.rootId, 'system'); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.35, stage.clientWidth / 2, stage.clientHeight / 2); }
    if (event.key === '-') { event.preventDefault(); zoom(1 / 1.35, stage.clientWidth / 2, stage.clientHeight / 2); }
    const offsets: Record<string, [number, number]> = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
    const offset = offsets[event.key];
    if (offset) { event.preventDefault(); const start = performance.now(); camera = { ...camera, x: camera.x + offset[0], y: camera.y + offset[1] }; updateCameraFocus(); render('pan', start); }
  };
  const locate = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === 'string') go(event.detail, 'relation-locate'); };
  stage.addEventListener('locate', locate);
  const observer = new ResizeObserver(() => render('resize'));
  observer.observe(stage);
  render('load');
  return () => { observer.disconnect(); stage.removeEventListener('locate', locate); };
}
