import type { PlannedSystemModel } from '@bunker-code/contracts';
import { emptyImplementation, validateImplementation, type DesignImplementation } from './designer-implementation.js';
import { requireValidPlannedSystem } from '@bunker-code/planned-system';

// Keep the original key namespace so old documents remain discoverable and conflicts stay explicit.
export const designerStoragePrefix = 'bunkercode.design.v1:';
export interface DesignerPresentation {
  lens?: 'structure' | 'implementation';
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}
export interface DesignerDocument {
  storageVersion: 2;
  implementation: DesignImplementation;
  model: PlannedSystemModel;
  updatedAt: string;
  presentation: DesignerPresentation;
}
export interface StoredDesignerDocument { document: DesignerDocument; raw: string }
export interface DesignerStorageIssue { key: string; raw: string | null; message: string }
export type DesignerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[], name: string): void {
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown) throw new TypeError(`Unknown ${name} field: ${unknown}.`);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

export function parseDesignerDocument(raw: string): DesignerDocument {
  const value: unknown = JSON.parse(raw);
  if (!record(value) || (value.storageVersion !== 1 && value.storageVersion !== 2)) throw new TypeError('Unsupported local document format.');
  exact(value, value.storageVersion === 1 ? ['storageVersion', 'model', 'updatedAt', 'presentation'] : ['storageVersion', 'model', 'implementation', 'updatedAt', 'presentation'], 'local document');
  const model = requireValidPlannedSystem(value.model);
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new TypeError('Invalid local save date.');
  const presentation = value.presentation;
  if (!record(presentation) || !record(presentation.positions)) throw new TypeError('Invalid saved layout.');
  exact(presentation, ['positions', 'viewport', 'lens'], 'presentation');
  if (presentation.lens !== undefined && presentation.lens !== 'structure' && presentation.lens !== 'implementation') throw new TypeError('Unsupported DESIGN lens.');
  const positions: DesignerPresentation['positions'] = {};
  for (const [id, point] of Object.entries(presentation.positions)) {
    if (!record(point) || !finite(point.x) || !finite(point.y)) throw new TypeError('Invalid Part position.');
    exact(point, ['x', 'y'], 'Part position');
    if (!model.parts.some((part) => part.id === id)) throw new TypeError('Saved position references a missing Part.');
    Object.defineProperty(positions, id, { value: { x: point.x, y: point.y }, enumerable: true, writable: true, configurable: true });
  }
  const viewport = presentation.viewport;
  if (viewport !== undefined && (!record(viewport) || !finite(viewport.x) || !finite(viewport.y) || !finite(viewport.zoom) || viewport.zoom < 0.1 || viewport.zoom > 3)) {
    throw new TypeError('Invalid saved viewport.');
  }
  if (record(viewport)) exact(viewport, ['x', 'y', 'zoom'], 'viewport');
  return {
    storageVersion: 2, implementation: value.storageVersion === 1 ? emptyImplementation() : validateImplementation(value.implementation, model), model, updatedAt: value.updatedAt,
    presentation: { positions, ...(presentation.lens === undefined ? {} : { lens: presentation.lens }), ...(record(viewport) && finite(viewport.x) && finite(viewport.y) && finite(viewport.zoom)
      ? { viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } } : {}) },
  };
}

export function readDesignerLibrary(storage: DesignerStorage): { documents: StoredDesignerDocument[]; issues: DesignerStorageIssue[] } {
  const documents: StoredDesignerDocument[] = [];
  const issues: DesignerStorageIssue[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(designerStoragePrefix)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const document = parseDesignerDocument(raw);
      if (key !== designerStoragePrefix + document.model.id) throw new TypeError('Local document identity does not match its storage key.');
      documents.push({ document, raw });
    } catch (error) { issues.push({ key, raw, message: error instanceof Error ? error.message : String(error) }); }
  }
  documents.sort((a, b) => b.document.updatedAt.localeCompare(a.document.updatedAt));
  return { documents, issues };
}

export function saveDesignerDocument(storage: DesignerStorage, document: DesignerDocument, expectedRaw: string | null): StoredDesignerDocument {
  const raw = JSON.stringify(document);
  const validated = parseDesignerDocument(raw);
  const key = designerStoragePrefix + validated.model.id;
  if (storage.getItem(key) !== expectedRaw) throw new Error('This system changed in another tab or already exists. Return to Systems and reopen it before saving.');
  storage.setItem(key, raw);
  return { document: validated, raw };
}

export function deleteDesignerDocument(storage: DesignerStorage, key: string, expectedRaw: string | null): void {
  if (!key.startsWith(designerStoragePrefix)) throw new Error('Not a DESIGN document.');
  if (storage.getItem(key) !== expectedRaw) throw new Error('This system changed in another tab. Refresh the library before deleting it.');
  storage.removeItem(key);
}

export function importPlannedSystemJSON(raw: string): PlannedSystemModel {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new TypeError('This file is not valid JSON.'); }
  return requireValidPlannedSystem(value);
}

export function exportPlannedSystemJSON(model: PlannedSystemModel): string {
  return JSON.stringify(requireValidPlannedSystem(model), null, 2);
}

export interface PortableDesignDocument {
  format: 'bunkercode-design';
  documentVersion: 1;
  model: PlannedSystemModel;
  implementation: DesignImplementation;
  presentation: DesignerPresentation;
  metadata: { updatedAt: string };
}

export function exportDesignDocumentJSON(document: DesignerDocument): string {
  const valid = parseDesignerDocument(JSON.stringify(document));
  const portable: PortableDesignDocument = { format: 'bunkercode-design', documentVersion: 1,
    model: valid.model, implementation: valid.implementation, presentation: valid.presentation, metadata: { updatedAt: valid.updatedAt } };
  return JSON.stringify(portable, null, 2);
}
export function importDesignDocumentJSON(raw: string): DesignerDocument {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new TypeError('This file is not valid JSON.'); }
  if (!record(value) || value.format !== 'bunkercode-design' || value.documentVersion !== 1) throw new TypeError('Unsupported Design Document format or version.');
  exact(value, ['format', 'documentVersion', 'model', 'implementation', 'presentation', 'metadata'], 'Design Document');
  if (!record(value.metadata)) throw new TypeError('Missing Design Document metadata.');
  exact(value.metadata, ['updatedAt'], 'metadata');
  return parseDesignerDocument(JSON.stringify({ storageVersion: 2, model: value.model, implementation: value.implementation,
    presentation: value.presentation, updatedAt: value.metadata.updatedAt }));
}
export function importDesignerJSON(raw: string): DesignerDocument {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new TypeError('This file is not valid JSON.'); }
  if (record(value) && ('format' in value || 'documentVersion' in value)) return importDesignDocumentJSON(raw);
  return { storageVersion: 2, model: importPlannedSystemJSON(raw), implementation: emptyImplementation(), presentation: { positions: {} }, updatedAt: new Date().toISOString() };
}
