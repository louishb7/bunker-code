import { createDesignDocument, createLayoutDocument, parseDesignDocument, parseLayoutDocument, type DesignSnapshot } from "@bunker-code/design-model";

const STORAGE_KEY = "bunkercode:studio:v1";

export function loadStudio(): DesignSnapshot {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return { design: createDesignDocument(), layout: createLayoutDocument() };
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("O documento salvo do Studio V1 é inválido.");
  const design = parseDesignDocument(value.design);
  return { design, layout: parseLayoutDocument(value.layout, design) };
}

export function saveStudio(snapshot: DesignSnapshot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
