import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlannedSystemModel, savePlannedPart, removePlannedPart, savePlannedRelation } from '../packages/planned-system/src/index.js';
import { designerStoragePrefix, deleteDesignerDocument, exportPlannedSystemJSON, importPlannedSystemJSON,
  exportDesignDocumentJSON, importDesignDocumentJSON, importDesignerJSON, parseDesignerDocument, readDesignerLibrary, saveDesignerDocument, type DesignerDocument,
} from '../apps/explorer-web/src/design/designer-storage.js';
import { assignTechnology, emptyImplementation, implementationAfterModelEdit, implementationStack, removeTechnology, unassignTechnology, validateImplementation } from '../apps/explorer-web/src/design/designer-implementation.js';
import { exportDesignerSVG } from '../apps/explorer-web/src/design/designer-visual-export.js';
import { positionsForEdit } from '../apps/explorer-web/src/design/designer-layout.js';

function memoryStorage() {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function document(id = 'system'): DesignerDocument {
  return { storageVersion: 2, implementation: { technologies: [], assignments: [] }, model: savePlannedPart(createPlannedSystemModel({ id, representedSystem: 'Future Project' }), { id: 'api', label: 'API' }), updatedAt: '2026-09-22T12:00:00.000Z', presentation: { positions: { api: { x: 15, y: 90 } }, viewport: { x: 20, y: 30, zoom: 0.8 } } };
}
test('local documents survive reload while semantic JSON exports preserve only authored data', () => {
  const storage = memoryStorage();
  const first = saveDesignerDocument(storage, document(), null);
  saveDesignerDocument(storage, document('another-system'), null);
  const library = readDesignerLibrary(storage);
  assert.equal(library.documents.length, 2);
  assert.deepEqual(library.issues, []);
  assert.deepEqual(library.documents.find((entry) => entry.document.model.id === 'system'), first);
  assert.deepEqual(importPlannedSystemJSON(exportPlannedSystemJSON(first.document.model)), first.document.model);
  assert.deepEqual(JSON.parse(exportPlannedSystemJSON(first.document.model)), first.document.model);
  assert.throws(() => importPlannedSystemJSON(first.raw), /not part of Planned System Model/);
  const changed = saveDesignerDocument(storage, { ...first.document, model: savePlannedPart(first.document.model, { id: 'api', label: 'Public API' }) }, first.raw);
  assert.equal(parseDesignerDocument(storage.getItem(designerStoragePrefix + 'system')!).model.parts[0]?.label, 'Public API');
  deleteDesignerDocument(storage, designerStoragePrefix + 'system', changed.raw);
  assert.equal(readDesignerLibrary(storage).documents.length, 1);
});
test('invalid local data stays intact and cannot become editable or corrupt valid documents', () => {
  const storage = memoryStorage();
  const valid = saveDesignerDocument(storage, document(), null);
  const bad = JSON.stringify({ ...document('broken'), model: { ...document('broken').model, relations: [{ id: 'bad', sourcePartId: 'missing', targetPartId: 'api', predicateId: 'missing' }] } });
  storage.setItem(designerStoragePrefix + 'broken', bad);
  storage.setItem(designerStoragePrefix + 'malformed', '{');
  storage.setItem('other-app', 'unrelated');
  assert.equal(readDesignerLibrary(storage).documents.length, 1);
  assert.equal(readDesignerLibrary(storage).issues.length, 2);
  assert.equal(storage.getItem(designerStoragePrefix + 'broken'), bad);
  assert.throws(() => importPlannedSystemJSON('{'), /not valid JSON/);
  assert.throws(() => parseDesignerDocument(JSON.stringify({ ...document(), storageVersion: 999 })), /Unsupported/);
  assert.throws(() => parseDesignerDocument(JSON.stringify({ ...document(), presentation: { positions: { api: { x: null, y: 1 } } } })), /position/);
  assert.equal(storage.getItem(designerStoragePrefix + 'system'), valid.raw);
  assert.equal(storage.getItem('other-app'), 'unrelated');
});
test('identity conflicts, stale saves and storage failures are explicit and preserve earlier saves', () => {
  const storage = memoryStorage();
  const first = saveDesignerDocument(storage, document(), null);
  assert.throws(() => saveDesignerDocument(storage, document(), null), /already exists/);
  const next = saveDesignerDocument(storage, { ...document(), updatedAt: '2026-09-22T14:00:00.000Z' }, first.raw);
  assert.throws(() => saveDesignerDocument(storage, document(), first.raw), /another tab/);
  assert.throws(() => deleteDesignerDocument(storage, designerStoragePrefix + 'system', first.raw), /another tab/);
  assert.throws(() => saveDesignerDocument({ ...storage, setItem: () => { throw new Error('Quota exceeded'); } }, document(), next.raw), /Quota/);
  assert.equal(storage.getItem(designerStoragePrefix + 'system'), next.raw);
});

// A newly created Part used to reuse array-index coordinates even after manual arrangement.
test('Part placement preserves manual and legacy positions through additions and removals', () => {
  const first = document().model;
  const before = savePlannedPart(first, { id: 'worker', label: 'Worker' });
  const after = savePlannedPart(before, { id: 'database', label: 'Database' });
  const manual = { positions: { api: { x: 320, y: 0 }, worker: { x: 0, y: 0 } } };
  const positions = positionsForEdit(before, after, manual);
  assert.deepEqual(positions.api, manual.positions.api);
  assert.deepEqual(positions.worker, manual.positions.worker);
  assert.ok(positions.database && positions.api);
  assert.ok(Math.abs(positions.database.x - positions.api.x) >= 260 || Math.abs(positions.database.y - positions.api.y) >= 152, 'new Part does not cover an existing Part');
  const remaining = removePlannedPart(before, 'api');
  const legacyPositions = positionsForEdit(before, remaining, { positions: {} });
  assert.deepEqual(legacyPositions.worker, { x: 320, y: 0 }, 'removing another Part must not shift an older document’s implicit position');
});

// Complementary metadata must survive document boundaries without leaking into Grammar.
test('implementation edits reuse labels, preserve inputs and clean references on removal', () => {
  const model = savePlannedPart(document().model, { id: 'worker', label: 'Worker' });
  const empty = emptyImplementation();
  const first = assignTechnology(empty, model, 'api', 'TypeScript', 'ts');
  const shared = assignTechnology(first, model, 'worker', ' typescript ', 'unused-id');
  assert.deepEqual(empty, emptyImplementation());
  assert.equal(shared.technologies.length, 1);
  assert.deepEqual(assignTechnology(shared, model, 'api', 'TypeScript', 'unused'), shared);
  const custom = assignTechnology(shared, model, 'api', 'Internal SDK', 'sdk');
  assert.equal(implementationStack(custom)[0]?.partIds.length, 2);
  assert.equal(unassignTechnology(custom, model, 'api', 'ts').assignments.length, 2);
  const after = removePlannedPart(model, 'api');
  assert.deepEqual(implementationAfterModelEdit(custom, model, after).assignments, [{ partId: 'worker', technologyId: 'ts' }]);
  assert.equal(removeTechnology(custom, model, 'ts').assignments.length, 1);
  assert.throws(() => assignTechnology(custom, model, 'missing', 'React', 'react'), /assignment/);
  assert.throws(() => assignTechnology(custom, model, 'api', 'React', 'ts'), /Duplicate/);
  assert.throws(() => validateImplementation({ ...custom, assignments: [...custom.assignments, custom.assignments[0]] }, model), /Duplicate/);
  assert.throws(() => validateImplementation({ ...custom, technologies: [...custom.technologies, { id: 'other', label: 'TYPESCRIPT' }] }, model), /Duplicate/);
});

test('legacy storage migrates on save and portable documents strictly preserve all layers', () => {
  const storage = memoryStorage();
  const { implementation: _, ...base } = document();
  const legacy = JSON.stringify({ ...base, storageVersion: 1 });
  storage.setItem(designerStoragePrefix + 'system', legacy);
  const loaded = readDesignerLibrary(storage).documents[0];
  assert.ok(loaded);
  assert.deepEqual(loaded.document.implementation, emptyImplementation());
  assert.equal(storage.getItem(designerStoragePrefix + 'system'), legacy, 'reading cannot rewrite legacy data');
  const doc = { ...loaded.document, implementation: assignTechnology(emptyImplementation(), base.model, 'api', 'PostgreSQL', 'pg'), presentation: { ...base.presentation, lens: 'implementation' as const } };
  const saved = saveDesignerDocument(storage, doc, legacy);
  assert.equal(JSON.parse(saved.raw).storageVersion, 2);
  const portable = exportDesignDocumentJSON(doc);
  assert.deepEqual(importDesignDocumentJSON(portable), doc);
  assert.deepEqual(importDesignerJSON(portable), doc);
  assert.deepEqual(JSON.parse(exportPlannedSystemJSON(doc.model)), doc.model);
  assert.deepEqual(importDesignerJSON(exportPlannedSystemJSON(doc.model)).implementation, emptyImplementation());
  const value = JSON.parse(portable);
  for (const invalid of [{ ...value, documentVersion: 99 }, { ...value, unknown: true }, { ...value, implementation: undefined }, { ...value, implementation: { ...value.implementation, assignments: [{ partId: 'missing', technologyId: 'pg' }] } }, { ...value, presentation: { positions: { missing: { x: 0, y: 0 } } } }]) {
    assert.throws(() => importDesignDocumentJSON(JSON.stringify(invalid)));
  }
  assert.equal(storage.getItem(designerStoragePrefix + 'system'), saved.raw);
});

test('visual export is standalone, escapes authored text and covers the system independently of the camera', () => {
  const doc = document();
  doc.model = savePlannedPart(doc.model, { id: 'api', label: '<API & client>' });
  doc.implementation = assignTechnology(emptyImplementation(), doc.model, 'api', '<Custom SDK>', 'sdk');
  doc.presentation.lens = 'implementation';
  const svg = exportDesignerSVG(doc);
  assert.match(svg, /&lt;API &amp; client&gt;/);
  assert.match(svg, /&lt;Custom SDK&gt;/);
  assert.doesNotMatch(svg, /foreignObject|<script/);
  assert.equal(exportDesignerSVG({ ...doc, presentation: { ...doc.presentation, viewport: { x: -10000, y: -10000, zoom: 0.1 } } }), svg);
  assert.doesNotMatch(exportDesignerSVG({ ...doc, presentation: { ...doc.presentation, lens: 'structure' } }), /Custom SDK/);
});

// Many parallel connections can curve beyond the node rectangle even with a far-away camera.
test('SVG bounds contain the visible curves of parallel Relations', () => {
  const doc = document();
  doc.model = savePlannedPart(doc.model, { id: 'worker', label: 'Worker' });
  doc.presentation.positions = { api: { x: 0, y: 0 }, worker: { x: 600, y: 0 } };
  for (let i = 0; i < 18; i += 1) doc.model = savePlannedRelation(doc.model,
    { id: `relation-${i}`, sourcePartId: 'api', targetPartId: 'worker', predicateId: `predicate-${i}` },
    { id: `predicate-${i}`, label: `interaction ${i}`, description: 'An authored interaction.' });
  const svg = exportDesignerSVG(doc);
  const box = svg.match(/viewBox="([^"]+)"/)?.[1]?.split(' ').map(Number);
  assert.ok(box && box.length === 4);
  const [x, y, width, height] = box as [number, number, number, number];
  const curves = [...svg.matchAll(/<path d="M ([^"]+ C [^"]+)"/g)];
  assert.equal(curves.length, 18);
  for (const match of curves) {
    const values = match[1]!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    assert.equal(values.length, 8);
    const [sx, sy, ax, ay, bx, by, tx, ty] = values as [number, number, number, number, number, number, number, number];
    for (let step = 0; step <= 10; step += 1) {
      const t = step / 10, u = 1 - t;
      const px = u ** 3 * sx + 3 * u ** 2 * t * ax + 3 * u * t ** 2 * bx + t ** 3 * tx;
      const py = u ** 3 * sy + 3 * u ** 2 * t * ay + 3 * u * t ** 2 * by + t ** 3 * ty;
      assert.ok(px >= x && px <= x + width && py >= y && py <= y + height, 'The complete curve must fit the exported image');
    }
  }
});
