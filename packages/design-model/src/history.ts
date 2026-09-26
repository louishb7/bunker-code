import type { DesignSnapshot } from "./index";

export interface DesignHistory {
  past: DesignSnapshot[];
  present: DesignSnapshot;
  future: DesignSnapshot[];
}

export function createHistory(present: DesignSnapshot): DesignHistory { return { past: [], present, future: [] }; }
export function commitHistory(history: DesignHistory, present: DesignSnapshot): DesignHistory {
  if (history.present.design === present.design && history.present.layout === present.layout) return history;
  return { past: [...history.past.slice(-99), history.present], present, future: [] };
}
export function replacePresentHistory(history: DesignHistory, present: DesignSnapshot): DesignHistory { return { ...history, present }; }
export function discardLastHistory(history: DesignHistory): DesignHistory {
  const previous = history.past.at(-1);
  return previous ? { past: history.past.slice(0, -1), present: previous, future: [] } : history;
}
export function undoHistory(history: DesignHistory): DesignHistory {
  const previous = history.past.at(-1);
  return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history;
}
export function redoHistory(history: DesignHistory): DesignHistory {
  const next = history.future[0];
  return next ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) } : history;
}
