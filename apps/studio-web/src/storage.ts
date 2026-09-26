import { createDesignDocument, parseDesignDocument, type DesignDocument } from "@bunker-code/design-model";

const STORAGE_KEY = "bunkercode:studio:v0";

export interface StoredStudio {
  design: DesignDocument;
  scene: unknown | null;
}

export function loadStudio(): StoredStudio {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return { design: createDesignDocument(), scene: null };
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || !("design" in value) || !("scene" in value)) {
    throw new Error("Invalid saved Studio document.");
  }
  const scene = value.scene;
  if (scene !== null && (typeof scene !== "object" || !Array.isArray((scene as { elements?: unknown }).elements))) {
    throw new Error("Invalid saved canvas scene.");
  }
  return { design: parseDesignDocument(value.design), scene };
}

export function saveStudio(design: DesignDocument, scene: string | null): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ design, scene: scene === null ? null : JSON.parse(scene) }));
}
