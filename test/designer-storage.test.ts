import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlannedSystemModel, savePlannedPart, removePlannedPart } from '../packages/planned-system/src/index.js';
import { designerStoragePrefix, deleteDesignerDocument, exportPlannedSystemJSON, importPlannedSystemJSON,
  parseDesignerDocument, readDesignerLibrary, saveDesignerDocument, type DesignerDocument,
} from '../apps/explorer-web/src/design/designer-storage.js';
import { positionsForEdit } from '../apps/explorer-web/src/design/designer-layout.js';

function memoryStorage() {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function document(id = 'system'): DesignerDocument {
  return { storageVersion: 1, model: savePlannedPart(createPlannedSystemModel({ id, representedSystem: 'Future Project' }), { id: 'api', label: 'API' }), updatedAt: '2026-09-22T12:00:00.000Z', presentation: { positions: { api: { x: 15, y: 90 } }, viewport: { x: 20, y: 30, zoom: 0.8 } } };
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
  assert.throws(() => parseDesignerDocument(JSON.stringify({ ...document(), storageVersion: 2 })), /Unsupported/);
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
