import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { snapshots } from './snapshots.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import { factsFrom, node, project } from './facts.js';
import { skeletonScene } from './peneira2/skeleton.js';
import { foveatedScene } from './peneira2/foveated.js';
import { panoramaScene } from './peneira2/panorama.js';

const hash = (file: string) => createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex');
assert.equal(hash('./hyperbolic/model.ts'), '5192cbf5eda1c13f280ae8954cb672c1ad80cc655f59c74a3813f6539429212d');
assert.equal(hash('./hyperbolic/view.ts'), 'd6da9f323e293906ba2ea9ba61c11de24104590f87f03a2bea082dd1a9723d11');
assert.equal(hash('./bench.ts'), 'fb1104687abcb3870be12618081212e7bef56d5e7b4056952243886e0fccc8fc');
assert.equal(hash('./style.css'), '79d8ee4c299d5da41460dbb0507264ff278934f4aede765567b5a589d4328d73');
let states = 0;
for (const snapshot of snapshots) {
  assert.equal(hash(`./.snapshots/${snapshot.id}.json`), snapshot.sha256);
  const runtime = createExplorerRuntime(JSON.parse(readFileSync(new URL(`./.snapshots/${snapshot.id}.json`, import.meta.url), 'utf8')));
  if (runtime.kind !== 'ready') throw new Error('Invalid frozen snapshot');
  const facts = factsFrom(runtime.graph, runtime.structure);
  const independent = factsFrom({ ...runtime.graph, edges: [] }, { ...runtime.structure,
    units: [...runtime.structure.units].reverse(), containments: [...runtime.structure.containments].reverse() });
  const expected = runtime.graph.edges.filter(e => e.dependencyKind === 'internal').sort((a, b) => a.id.localeCompare(b.id));
  for (const build of [skeletonScene, foveatedScene, panoramaScene]) {
    for (const n of facts.nodes.values()) {
      const reached = new Set<string>();
      let canonicalIds: string[] | undefined;
      for (let offset = 0; offset < Math.max(1, n.children.length); offset++) {
        const scene = build(facts, n.id, offset);
        assert.deepEqual(scene, build(independent, n.id, offset), 'Dependencies/order cannot determine geography');
        assert.deepEqual(scene.places.flatMap(p => p.members).sort(), [...scene.context.ids].sort());
        if (canonicalIds) assert.deepEqual(scene.context.ids, canonicalIds, 'Disclosure cannot change logical ownership');
        canonicalIds = scene.context.ids;
        for (const p of scene.places) {
          assert.ok(p.label || node(facts, p.id).label);
          if (p.role === 'child') { assert.equal(node(facts, p.id).parentId, n.id); reached.add(p.id); }
          if (p.role === 'aggregate') assert.ok(p.action && p.members.length);
        }
        const projection = project(facts, scene.context.ids);
        assert.equal(projection.fileOwnershipById.size, node(facts, facts.rootId).files.length);
        const edges = [...projection.relations.flatMap(r => r.fileEdges), ...projection.internalDependenciesWithinLandmarks.flatMap(r => r.fileEdges), ...projection.boundaryCrossingInternalDependencies.map(r => r.edge)].sort((a, b) => a.id.localeCompare(b.id));
        assert.deepEqual(edges, expected, 'Full edge evidence and direction must survive');
        states++;
      }
      assert.deepEqual([...reached].sort(), [...n.children].sort(), 'Every direct child is a named navigable target in a window');
    }
    const pkg = { id: 'workspace-package:empty-probe', kind: 'workspace-package' as const, origin: 'detected' as const, rootPath: 'empty-probe', name: '@probe/empty', evidence: [] };
    const empty = factsFrom(runtime.graph, { ...runtime.structure, units: [...runtime.structure.units,
      { id: 'directory:empty-probe', kind: 'directory', rootPath: 'empty-probe', source: 'filesystem' }, pkg],
      containments: [...runtime.structure.containments, { parentUnitId: facts.rootId, child: { kind: 'structural-unit', structuralUnitId: 'directory:empty-probe' }, source: 'filesystem' }] });
    assert.equal(node(empty, 'directory:empty-probe').workspacePackage?.id, pkg.id);
    assert.deepEqual(node(empty, 'directory:empty-probe').files, []);
    assert.ok(build(empty, 'directory:empty-probe', 0).places.some(p => p.id === 'directory:empty-probe' && p.role === 'focus'));
  }
  console.log(`${snapshot.id}: H1/H2/H3 ownership, evidence, packages, direct files, deterministic disclosure passed`);
}
console.log(`${states} Peneira 2 scene states checked; H0 hashes unchanged`);
