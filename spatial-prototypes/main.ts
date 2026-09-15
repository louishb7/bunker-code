import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import { factsFrom } from './facts.js';
import { button, createBench, element } from './bench.js';
import { snapshots } from './snapshots.js';
import { mountAtlas } from './atlas/view.js';
import { mountHyperbolic } from './hyperbolic/view.js';
import { mountIcicle } from './icicle/view.js';

async function main() {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing app root');
  const query = new URLSearchParams(location.search);
  const candidate = query.get('candidate') ?? 'atlas';
  if (!['atlas', 'hyperbolic', 'icicle'].includes(candidate)) throw new Error('Unknown candidate');
  const snapshot = snapshots.find(s => s.id === (query.get('project') ?? 'bc'));
  if (!snapshot) throw new Error('Unknown frozen project');
  const header = element('header');
  header.append(element('strong', `Peneira 1 · ${candidate}`));
  const projects = element('select');
  projects.setAttribute('aria-label', 'Projeto');
  for (const s of snapshots) {
    const option = element('option', s.label);
    option.value = s.id;
    option.selected = s.id === snapshot.id;
    projects.append(option);
  }
  projects.onchange = () => { query.set('project', projects.value); location.search = query.toString(); };
  header.append(projects);
  for (const name of ['atlas', 'hyperbolic', 'icicle']) {
    const link = element('a', name);
    link.href = `/?candidate=${name}&project=${snapshot.id}`;
    header.append(link);
  }
  const host = element('main');
  app.replaceChildren(header, element('p', 'Região = área/ramo/faixa · Package = P · File = F, sempre direto no pai indicado · Azul: Uses · Verde: Used by · Roxo: ambos', 'legend'), host);
  const response = await fetch(`/snapshots/${snapshot.id}.json`);
  if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (sha256 !== snapshot.sha256) throw new Error('Frozen snapshot hash mismatch');
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const runtime = createExplorerRuntime(value);
  if (runtime.kind !== 'ready') throw new Error(`Invalid snapshot: ${runtime.kind}`);
  const facts = factsFrom(runtime.graph, runtime.structure);
  const bench = createBench(host, facts, snapshot.id, candidate, sha256);
  const dispose = candidate === 'atlas' ? mountAtlas(bench) : candidate === 'hyperbolic' ? mountHyperbolic(bench) : mountIcicle(bench);
  header.append(button('Exportar sessão JSON', () => {
    const payload = { snapshot: { id: snapshot.id, sha256 }, candidate, timing: 'input handler to next rAF callback; not physical display latency',
      droppedEvents: bench.dropped, events: bench.metrics };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = element('a'); link.href = url; link.download = `peneira1-${candidate}-${snapshot.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  header.append(button('Zerar sessão', () => { bench.metrics.length = 0; bench.dropped = 0; bench.signature = ''; }));
  const provenance = element('details');
  provenance.append(element('summary', 'Snapshot congelado'), element('code', `${snapshot.label} · SHA-256 ${sha256}`));
  app.append(provenance);
  window.addEventListener('pagehide', () => { bench.disposed = true; dispose(); }, { once: true });
  document.documentElement.dataset.ready = 'true';
}

main().catch(error => {
  const output = element('pre', error instanceof Error ? error.message : String(error));
  output.setAttribute('role', 'alert'); document.body.append(output);
});
