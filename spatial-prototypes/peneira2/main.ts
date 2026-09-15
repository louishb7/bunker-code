import { createExplorerRuntime } from '../../apps/explorer-web/src/explorer-runtime.js';
import { factsFrom } from '../facts.js';
import { button, createBench, element } from '../bench.js';
import { snapshots } from '../snapshots.js';
import { mountLens } from './view.js';
import type { Lens } from './context.js';

async function main() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing app');
  const query = new URLSearchParams(location.search);
  const candidate = query.get('candidate');
  if (candidate !== 'hyperbolic-skeleton' && candidate !== 'hyperbolic-foveated' && candidate !== 'wildcard') throw new Error('Unknown Peneira 2 lens');
  const lens: Lens = candidate;
  const snapshot = snapshots.find(s => s.id === (query.get('project') ?? 'bc'));
  if (!snapshot) throw new Error('Unknown project');
  const header = element('header');
  const names = { 'hyperbolic-skeleton': 'H1 · Skeleton', 'hyperbolic-foveated': 'H2 · Zonas', wildcard: 'H3 · Panorama' };
  header.append(element('strong', names[lens]));
  const projects = element('select'); projects.setAttribute('aria-label', 'Projeto');
  for (const s of snapshots) { const option = element('option', s.label); option.value = s.id; option.selected = s.id === snapshot.id; projects.append(option); }
  projects.onchange = () => { query.set('project', projects.value); location.search = query.toString(); };
  header.append(projects);
  for (const [name, label] of [['hyperbolic', 'H0'], ['hyperbolic-skeleton', 'H1'], ['hyperbolic-foveated', 'H2'], ['wildcard', 'H3']]) {
    const link = element('a', label); link.href = `/?candidate=${name}&project=${snapshot.id}`; header.append(link);
  }
  const host = element('main');
  app.replaceChildren(header, element('p', 'Peneira 2 · Clique/Enter entra · Espaço/Shift+clique consulta Uses/Used by · Backspace volta · Home: System · PageDown/PageUp: outros filhos', 'legend'), host);
  const response = await fetch(`/snapshots/${snapshot.id}.json`);
  if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== snapshot.sha256) throw new Error('Snapshot hash mismatch');
  const runtime = createExplorerRuntime(JSON.parse(new TextDecoder().decode(bytes)));
  if (runtime.kind !== 'ready') throw new Error(`Invalid snapshot: ${runtime.kind}`);
  const bench = createBench(host, factsFrom(runtime.graph, runtime.structure), snapshot.id, lens, hash);
  const dispose = mountLens(bench, lens);
  header.append(button('Exportar sessão JSON', () => {
    const payload = { snapshot: { id: snapshot.id, sha256: hash }, candidate: lens,
      timing: 'Input handler to next rAF callback; not display latency', counts: 'camera fields count locations + UI aggregates; ancestry breadcrumb excluded',
      droppedEvents: bench.dropped, events: bench.metrics };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = element('a'); a.href = url; a.download = `peneira2-${lens}-${snapshot.id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  header.append(button('Zerar sessão', () => { bench.metrics.length = 0; bench.dropped = 0; bench.signature = ''; }));
  const provenance = element('details'); provenance.append(element('summary', 'Dados e legenda'), element('p', `SHA-256 ${hash}. F = arquivo direto; P = package. Linhas/zonas = containment. Azul Uses, verde Used by, roxo ambos. Agregados são acessos de apresentação, não módulos.`));
  app.append(provenance);
  document.documentElement.dataset.ready = 'true';
  window.addEventListener('pagehide', () => { bench.disposed = true; dispose(); }, { once: true });
}
main().catch(error => { const p = element('pre', String(error)); p.setAttribute('role', 'alert'); document.body.append(p); });
