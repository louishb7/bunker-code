export const SEMANTIC_KINDS = ["component", "boundary", "data-store", "queue-event", "external-system", "actor"] as const;
export type SemanticKind = typeof SEMANTIC_KINDS[number];
export type DecisionStatus = "open" | "accepted" | "rejected";

export interface Decision {
  id: string;
  title: string;
  reason: string;
  status: DecisionStatus;
}

export interface DesignEntity {
  id: string;
  canvasElementId: string;
  kind: SemanticKind;
  name: string;
  technology?: string;
  purpose: string;
  notes: string;
  decisions: Decision[];
}

export interface SystemContext {
  systemName: string;
  purpose: string;
  registeredUsers: string;
  dailyActiveUsers: string;
  peakConcurrentUsers: string;
  peakRequestsPerSecond: string;
  availabilityTarget: string;
  latencyTarget: string;
  dataSensitivity: string;
  budgetConstraint: string;
  deploymentConstraint: string;
}

export interface DesignDocument {
  schemaVersion: 1;
  systemContext: SystemContext;
  entities: DesignEntity[];
}

export const CONSIDERATIONS: Readonly<Record<SemanticKind, readonly string[]>> = {
  "component": ["What responsibility does this component own?", "What does it depend on?", "What depends on it?"],
  "boundary": ["How is input validated?", "Does this boundary require authentication or authorization?", "Are there latency or error-contract requirements?"],
  "data-store": ["Who owns this data?", "What consistency does this data require?", "Does this data have sensitivity or retention requirements?", "What happens if the store is unavailable?"],
  "queue-event": ["What happens when processing fails?", "Can the same message be delivered more than once?", "Does ordering matter?", "How should retries be handled?"],
  "external-system": ["What happens when this dependency is unavailable?", "Are timeouts and rate limits relevant?", "Who owns this dependency?"],
  "actor": ["What can this actor do?", "Which boundaries can this actor reach?"],
};

export function createDesignDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    systemContext: {
      systemName: "", purpose: "", registeredUsers: "", dailyActiveUsers: "",
      peakConcurrentUsers: "", peakRequestsPerSecond: "", availabilityTarget: "",
      latencyTarget: "", dataSensitivity: "", budgetConstraint: "", deploymentConstraint: "",
    },
    entities: [],
  };
}

export function addEntity(document: DesignDocument, canvasElementId: string, kind: SemanticKind): DesignDocument {
  if (!canvasElementId) throw new Error("A canvas element ID is required.");
  if (document.entities.some((entity) => entity.canvasElementId === canvasElementId)) {
    throw new Error("This canvas element already has system meaning.");
  }
  return {
    ...document,
    entities: [...document.entities, {
      id: `entity:${canvasElementId}`, canvasElementId, kind, name: "", purpose: "", notes: "", decisions: [],
    }],
  };
}

export function updateEntity(document: DesignDocument, entity: DesignEntity): DesignDocument {
  if (!document.entities.some((current) => current.id === entity.id && current.canvasElementId === entity.canvasElementId)) {
    throw new Error("The entity does not exist or its canvas link changed.");
  }
  return { ...document, entities: document.entities.map((current) => current.id === entity.id ? entity : current) };
}

export function addDecision(document: DesignDocument, entityId: string): DesignDocument {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error("The entity does not exist.");
  const nextNumber = Math.max(0, ...entity.decisions.map((decision) => {
    const match = /^decision:(\d+)$/.exec(decision.id);
    return match ? Number(match[1]) : 0;
  })) + 1;
  return updateEntity(document, {
    ...entity,
    decisions: [...entity.decisions, { id: `decision:${nextNumber}`, title: "", reason: "", status: "open" }],
  });
}

export function reconcileCanvasElements(document: DesignDocument, liveElementIds: ReadonlySet<string>): DesignDocument {
  const entities = document.entities.filter((entity) => liveElementIds.has(entity.canvasElementId));
  return entities.length === document.entities.length ? document : { ...document, entities };
}

export function parseDesignDocument(value: unknown): DesignDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.systemContext) || !Array.isArray(value.entities)) {
    throw new Error("Unsupported or invalid design document.");
  }
  const empty = createDesignDocument().systemContext;
  const context = value.systemContext;
  if (!Object.keys(empty).every((key) => typeof context[key] === "string")) {
    throw new Error("Invalid system context.");
  }
  const ids = new Set<string>();
  const links = new Set<string>();
  const entities: DesignEntity[] = [];
  const rawEntities: unknown[] = value.entities;
  for (const entity of rawEntities) {
    if (!isRecord(entity) || typeof entity.id !== "string" || !entity.id || typeof entity.canvasElementId !== "string" || !entity.canvasElementId ||
      !SEMANTIC_KINDS.includes(entity.kind as SemanticKind) || typeof entity.name !== "string" || typeof entity.purpose !== "string" ||
      typeof entity.notes !== "string" || (entity.technology !== undefined && typeof entity.technology !== "string") || !Array.isArray(entity.decisions) ||
      ids.has(entity.id) || links.has(entity.canvasElementId)) throw new Error("Invalid or duplicate design entity.");
    ids.add(entity.id);
    links.add(entity.canvasElementId);
    const decisionIds = new Set<string>();
    const decisions: Decision[] = [];
    const rawDecisions: unknown[] = entity.decisions;
    for (const decision of rawDecisions) {
      if (!isRecord(decision) || typeof decision.id !== "string" || !decision.id || decisionIds.has(decision.id) ||
        typeof decision.title !== "string" || typeof decision.reason !== "string" ||
        !["open", "accepted", "rejected"].includes(String(decision.status))) throw new Error("Invalid or duplicate decision.");
      decisionIds.add(decision.id);
      decisions.push({ id: decision.id, title: decision.title, reason: decision.reason, status: decision.status as DecisionStatus });
    }
    entities.push({ id: entity.id, canvasElementId: entity.canvasElementId, kind: entity.kind as SemanticKind,
      name: entity.name, purpose: entity.purpose, notes: entity.notes,
      ...(entity.technology === undefined ? {} : { technology: entity.technology }), decisions });
  }
  return { schemaVersion: 1, systemContext: {
    systemName: context.systemName as string, purpose: context.purpose as string,
    registeredUsers: context.registeredUsers as string, dailyActiveUsers: context.dailyActiveUsers as string,
    peakConcurrentUsers: context.peakConcurrentUsers as string, peakRequestsPerSecond: context.peakRequestsPerSecond as string,
    availabilityTarget: context.availabilityTarget as string, latencyTarget: context.latencyTarget as string,
    dataSensitivity: context.dataSensitivity as string, budgetConstraint: context.budgetConstraint as string,
    deploymentConstraint: context.deploymentConstraint as string,
  }, entities };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
