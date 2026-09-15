import { ancestors, description, neighbors, node, project } from './facts.js';
import type { Facts } from './facts.js';

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

export function button(text: string, action: (event: MouseEvent) => void): HTMLButtonElement {
  const el = element('button', text);
  el.type = 'button';
  el.onclick = action;
  return el;
}

export interface Metric {
  action: string;
  project: string;
  candidate: string;
  focus: string;
  selected: string | null;
  inputAtMs: number;
  feedbackMs: number;
  structuralAdvance: boolean;
  cameraWithoutAdvance: boolean;
  representatives: number;
  camera: object;
}

export interface Bench {
  facts: Facts;
  stage: HTMLDivElement;
  navigation: HTMLDivElement;
  relations: HTMLElement;
  status: HTMLElement;
  metrics: Metric[];
  projectId: string;
  candidate: string;
  sha256: string;
  signature: string;
  dropped: number;
  disposed: boolean;
}

export function createBench(host: HTMLElement, facts: Facts, projectId: string, candidate: string, sha256: string): Bench {
  const navigation = element('div', undefined, 'navigation');
  const row = element('div', undefined, 'workbench');
  const stage = element('div', undefined, 'stage');
  stage.tabIndex = 0;
  stage.setAttribute('aria-label', 'Mapa. Tab percorre locais; Enter entra; Espaço consulta relações; Backspace volta; Home retorna ao System.');
  const relations = element('aside', undefined, 'relations');
  const status = element('div', 'Carregando…', 'status');
  status.setAttribute('role', 'status');
  row.append(stage, relations);
  host.replaceChildren(navigation, row, status);
  return { facts, navigation, stage, relations, status, metrics: [], projectId, candidate, sha256,
    signature: '', dropped: 0, disposed: false };
}

export function trail(bench: Bench, focus: string, go: (id: string, action: string) => void, controls: HTMLElement[] = []) {
  const parent = node(bench.facts, focus).parentId;
  const up = button('↑ Pai', () => { if (parent) go(parent, 'parent'); });
  up.disabled = !parent;
  up.dataset.action = 'parent';
  const home = button('System', () => go(bench.facts.rootId, 'system'));
  home.dataset.action = 'system';
  const path = element('span', undefined, 'trail');
  for (const n of ancestors(bench.facts, focus)) {
    const b = button(n.label, () => go(n.id, 'ancestor'));
    b.title = `${n.path}\n${description(n)}`;
    path.append(b);
  }
  bench.navigation.replaceChildren(up, home, path, ...controls);
}

export function attention(bench: Bench, selected: string | null, ids: string[]) {
  const projection = project(bench.facts, ids);
  const neighborhood = selected ? neighbors(bench.facts, selected, projection.fileOwnershipById) : null;
  return { projection, neighborhood, outgoing: new Set(neighborhood?.outgoing.keys()), incoming: new Set(neighborhood?.incoming.keys()) };
}

export function renderRelations(bench: Bench, selected: string | null, ids: string[]) {
  const { projection, neighborhood } = attention(bench, selected, ids);
  bench.stage.dataset.ownerCount = String(projection.fileOwnershipById.size);
  bench.stage.dataset.representatives = JSON.stringify(ids);
  bench.stage.dataset.boundary = bench.facts.rootId;
  bench.relations.replaceChildren(element('h2', 'Relações internas'));
  if (!selected || !neighborhood) {
    bench.relations.append(element('p', 'Clique para entrar. Shift+clique ou Espaço consulta um local sem mudar escala.'));
    return;
  }
  const n = node(bench.facts, selected);
  bench.relations.append(element('strong', n.path), element('p', description(n)), element('p', `Pai: ${n.parentId ? node(bench.facts, n.parentId).path : '—'}`));
  for (const [title, entries] of [['Uses →', neighborhood.outgoing], ['Used by ←', neighborhood.incoming]] as const) {
    bench.relations.append(element('h3', `${title} ${entries.size}`));
    if (!entries.size) bench.relations.append(element('p', 'Nenhuma relação entre locais neste recorte.'));
    for (const [id, count] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
      const target = bench.facts.nodes.get(id);
      if (!target) { bench.relations.append(element('p', `${id} · fora da boundary · ${count}`)); continue; }
      const b = button(`${target.path} · ${count}`, () => bench.stage.dispatchEvent(new CustomEvent('locate', { detail: id })));
      b.dataset.relationTarget = id;
      bench.relations.append(b);
    }
  }
  bench.relations.append(element('p', `${neighborhood.within} dependencies dentro do local selecionado. Contagens são ocorrências estáticas; externas/evidence ficam fora desta peneira.`));
}

export function mark(bench: Bench, action: string, focus: string, selected: string | null, ids: string[], camera: object, inputAtMs: number) {
  const signature = `${focus}\0${ids.join('\0')}`;
  const structuralAdvance = Boolean(bench.signature) && bench.signature !== signature;
  bench.signature = signature;
  bench.stage.dataset.focus = focus;
  bench.stage.dataset.selected = selected ?? '';
  bench.stage.dataset.camera = JSON.stringify(camera);
  requestAnimationFrame(() => {
    if (bench.disposed) return;
    const metric = { action, project: bench.projectId, candidate: bench.candidate, focus, selected,
      inputAtMs, feedbackMs: performance.now() - inputAtMs, structuralAdvance,
      cameraWithoutAdvance: ['pan', 'zoom', 'recenter'].includes(action) && !structuralAdvance,
      representatives: ids.length, camera };
    bench.metrics.push(metric);
    if (bench.metrics.length > 10000) { bench.metrics.shift(); bench.dropped++; }
    bench.status.textContent = `${bench.projectId} · ${node(bench.facts, focus).path} · ${ids.length} representantes · ${metric.feedbackMs.toFixed(1)} ms input→rAF · ${bench.metrics.length} eventos`;
  });
}

export function color(id: string, selected: string | null, outgoing: Set<string>, incoming: Set<string>, kind: 'file' | 'region', isPackage: boolean) {
  if (id === selected) return '#ffdc85';
  if (outgoing.has(id) && incoming.has(id)) return '#dcb5f2';
  if (outgoing.has(id)) return '#8acbfa';
  if (incoming.has(id)) return '#8edcc1';
  return isPackage ? '#ddd0ac' : kind === 'file' ? '#e7ecf0' : '#c8d9df';
}

export function wireLandmark(el: HTMLElement, id: string, enter: (id: string) => void, select: (id: string) => void) {
  el.dataset.id = id;
  el.onclick = event => event.shiftKey ? select(id) : enter(id);
  el.onkeydown = event => {
    if (event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(id); }
  };
}

export function preserveMapFocus(stage: HTMLElement, draw: () => void) {
  const active = document.activeElement;
  const id = (active instanceof HTMLElement || active instanceof SVGElement) && stage.contains(active) ? active.dataset.id : undefined;
  draw();
  if (id) (stage.querySelector<HTMLElement | SVGElement>(`[data-id="${CSS.escape(id)}"]`) ?? stage).focus({ preventScroll: true });
}
