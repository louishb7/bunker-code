import type { PlannedSystemModel } from '@bunker-code/contracts';
import { requireValidPlannedSystem } from '@bunker-code/planned-system';

export const designerStoragePrefix = 'bunkercode.design.v1:';
export interface DesignerPresentation {
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}
export interface DesignerDocument {
  storageVersion: 1;
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
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

export function parseDesignerDocument(raw: string): DesignerDocument {
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.storageVersion !== 1) throw new TypeError('Unsupported local document format.');
  const model = requireValidPlannedSystem(value.model);
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new TypeError('Invalid local save date.');
  const presentation = value.presentation;
  if (!record(presentation) || !record(presentation.positions)) throw new TypeError('Invalid saved layout.');
  const positions: DesignerPresentation['positions'] = {};
  for (const [id, point] of Object.entries(presentation.positions)) {
    if (!record(point) || !finite(point.x) || !finite(point.y)) throw new TypeError('Invalid Part position.');
    Object.defineProperty(positions, id, { value: { x: point.x, y: point.y }, enumerable: true, writable: true, configurable: true });
  }
  const viewport = presentation.viewport;
  if (viewport !== undefined && (!record(viewport) || !finite(viewport.x) || !finite(viewport.y) || !finite(viewport.zoom) || viewport.zoom < 0.1 || viewport.zoom > 3)) {
    throw new TypeError('Invalid saved viewport.');
  }
  return {
    storageVersion: 1, model, updatedAt: value.updatedAt,
    presentation: { positions, ...(record(viewport) && finite(viewport.x) && finite(viewport.y) && finite(viewport.zoom)
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
