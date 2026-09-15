import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { snapshots } from './snapshots.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import { factsFrom, focusedPartition, project, node } from './facts.js';
import { atlasGeometry, atlasPartition, fit, rect } from './atlas/model.js';
import { hyperbolicGeometry, point, relative } from './hyperbolic/model.js';
import { icicleGeometry, iciclePartition, interval } from './icicle/model.js';

let states = 0;
for (const snapshot of snapshots) {
  const bytes = readFileSync(new URL(`./.snapshots/${snapshot.id}.json`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), snapshot.sha256);
  const runtime = createExplorerRuntime(JSON.parse(bytes.toString()));
  assert.equal(runtime.kind, 'ready');
  if (runtime.kind !== 'ready') throw new Error('Invalid runtime');
  const facts = factsFrom(runtime.graph, runtime.structure);
  const atlas = atlasGeometry(facts), hyper = hyperbolicGeometry(facts), icicle = icicleGeometry(facts);
  const reordered = factsFrom({ ...runtime.graph, edges: [...runtime.graph.edges].reverse() }, {
    ...runtime.structure, units: [...runtime.structure.units].reverse(), containments: [...runtime.structure.containments].reverse(),
  });
  assert.deepEqual(atlasGeometry(reordered), atlas);
  assert.deepEqual(hyperbolicGeometry(reordered), hyper);
  assert.deepEqual(icicleGeometry(reordered), icicle);
  const expected = facts.graph.edges.filter(e => e.dependencyKind === 'internal').map(e => e.id).sort();
  for (const n of facts.nodes.values()) {
    const box = rect(atlas, n.id), range = interval(icicle, n.id);
    assert.ok(box.width > 0 && box.height > 0);
    assert.ok(range.end > range.start);
    const centered = relative(point(hyper, n.id), point(hyper, n.id));
    assert.ok(Math.hypot(centered.x, centered.y) < 1e-8);
    if (n.parentId) {
      const parent = rect(atlas, n.parentId), pr = interval(icicle, n.parentId);
      assert.ok(box.x >= parent.x - 1e-8 && box.x + box.width <= parent.x + parent.width + 1e-8);
      assert.ok(box.y >= parent.y - 1e-8 && box.y + box.height <= parent.y + parent.height + 1e-8);
      assert.ok(range.start >= pr.start && range.end <= pr.end);
      assert.equal(n.depth, node(facts, n.parentId).depth + 1);
    }
    for (const ids of [atlasPartition(facts, atlas, fit(box, 1190, 688)), focusedPartition(facts, n.id), iciclePartition(facts, n.id)]) {
      const p = project(facts, ids);
      assert.equal(p.fileOwnershipById.size, node(facts, facts.rootId).files.length);
      const observed = [...p.relations.flatMap(r => r.fileEdges), ...p.internalDependenciesWithinLandmarks.flatMap(r => r.fileEdges), ...p.boundaryCrossingInternalDependencies.map(r => r.edge)].map(e => e.id).sort();
      assert.deepEqual(observed, expected);
      states++;
    }
    if (n.kind === 'file') assert.ok(node(facts, n.parentId ?? '').children.includes(n.id));
  }
  // A declared empty package must remain a spatial location, without fake files.
  const pkg = { id: 'workspace-package:empty-probe', kind: 'workspace-package' as const, origin: 'detected' as const,
    rootPath: 'empty-probe', name: '@probe/empty', evidence: [] };
  const emptyFacts = factsFrom(runtime.graph, { ...runtime.structure, units: [...runtime.structure.units,
    { id: 'directory:empty-probe', kind: 'directory', rootPath: 'empty-probe', source: 'filesystem' }, pkg],
    containments: [...runtime.structure.containments, { parentUnitId: facts.rootId, child: { kind: 'structural-unit', structuralUnitId: 'directory:empty-probe' }, source: 'filesystem' }] });
  assert.equal(node(emptyFacts, 'directory:empty-probe').workspacePackage?.id, pkg.id);
  assert.deepEqual(node(emptyFacts, 'directory:empty-probe').files, []);
  assert.ok(rect(atlasGeometry(emptyFacts), 'directory:empty-probe').width > 0);
  assert.ok(hyperbolicGeometry(emptyFacts).has('directory:empty-probe'));
  assert.ok(icicleGeometry(emptyFacts).has('directory:empty-probe'));
  console.log(`${snapshot.id}: equivalent snapshot, all locations, ownership, edge conservation, deterministic geometry, empty package passed`);
}
console.log(`${states} projection states checked`);
