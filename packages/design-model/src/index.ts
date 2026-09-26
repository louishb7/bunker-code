export const SEMANTIC_KINDS = ["component", "boundary", "data-store", "queue-event", "external-system", "actor"] as const;
export type SemanticKind = typeof SEMANTIC_KINDS[number];
export const RELATIONSHIP_KINDS = ["generic", "calls", "depends-on", "protects", "reads-writes", "emits", "consumes"] as const;
export type RelationshipKind = typeof RELATIONSHIP_KINDS[number];
export type DecisionStatus = "open" | "accepted" | "rejected";
export type ConsiderationStatus = "unreviewed" | "considered" | "not-relevant";

export interface Consideration { id: string; title: string; question: string; whyItMatters: string }
export const CONSIDERATIONS: Readonly<Record<SemanticKind, readonly Consideration[]>> = {
  "queue-event": [
    { id: "duplicate-delivery", title: "Entrega duplicada", question: "Esta mensagem pode ser processada mais de uma vez?", whyItMatters: "Alguns mecanismos podem reenviar uma mensagem depois de uma falha." },
    { id: "failure-retry", title: "Falhas e novas tentativas", question: "O que acontece quando o processamento falha?", whyItMatters: "Uma nova tentativa pode repetir efeitos de uma operação anterior." },
    { id: "ordering", title: "Ordem das mensagens", question: "A ordem de processamento importa?", whyItMatters: "Consumidores simultâneos podem receber mensagens em outra ordem." },
    { id: "processing-delay", title: "Atraso no processamento", question: "Quanto tempo esse trabalho pode esperar?", whyItMatters: "Um atraso pode afetar o resultado esperado por quem usa o sistema." },
  ],
  "data-store": [
    { id: "data-ownership", title: "Responsável pelos dados", question: "Quem é responsável por estes dados?", whyItMatters: "Definir essa responsabilidade ajuda a evitar gravações conflitantes." },
    { id: "consistency", title: "Consistência", question: "Quando uma alteração precisa ficar visível para leitura?", whyItMatters: "Uma gravação pode não aparecer imediatamente para todos os leitores." },
    { id: "availability", title: "Disponibilidade", question: "O que acontece se este armazenamento ficar indisponível?", whyItMatters: "Outras partes do sistema podem depender desses dados para continuar." },
    { id: "sensitivity-retention", title: "Dados sensíveis e retenção", question: "Há dados sensíveis ou um prazo para mantê-los?", whyItMatters: "O tipo de dado influencia como ele é protegido e quando deve ser removido." },
  ],
  "external-system": [
    { id: "availability", title: "Disponibilidade", question: "O que acontece quando o serviço externo fica indisponível?", whyItMatters: "Uma falha fora deste projeto também pode afetar seu funcionamento." },
    { id: "timeout", title: "Tempo de espera", question: "Quanto tempo uma chamada deve esperar pela resposta?", whyItMatters: "Esperas sem limite podem prender recursos e atrasar outras operações." },
    { id: "rate-limiting", title: "Limite de requisições", question: "Esse serviço limita a quantidade de chamadas?", whyItMatters: "O serviço pode recusar picos de uso ou impor cotas." },
    { id: "ownership", title: "Responsável pelo serviço", question: "Quem mantém esse serviço externo?", whyItMatters: "Saber quem é responsável ajuda quando contratos mudam ou ocorrem falhas." },
  ],
  "boundary": [
    { id: "validation", title: "Validação de entrada", question: "Como os dados recebidos são validados?", whyItMatters: "Dados inválidos não devem seguir como se fossem confiáveis." },
    { id: "auth", title: "Identidade e permissão", question: "Quem pode usar esta entrada e fazer o quê?", whyItMatters: "A identidade e as permissões definem quais operações ficam acessíveis." },
    { id: "latency-error", title: "Tempo de resposta e erros", question: "Que demora e que erros quem chama deve esperar?", whyItMatters: "Quem chama precisa saber o que ocorre quando uma operação falha ou demora." },
  ],
  "component": [
    { id: "owned-responsibility", title: "Responsabilidade principal", question: "O que esta parte faz dentro do sistema?", whyItMatters: "Uma responsabilidade clara facilita entender seus limites e alterações." },
    { id: "dependencies", title: "Dependências", question: "De quais outras partes ela precisa?", whyItMatters: "Essas dependências influenciam mudanças e possíveis falhas." },
    { id: "dependents", title: "Quem depende dela", question: "Quais partes precisam desta?", whyItMatters: "Uma alteração aqui pode afetar quem a utiliza." },
  ],
  "actor": [
    { id: "accessible-boundaries", title: "Entradas acessíveis", question: "Por quais entradas esta pessoa ou sistema pode interagir?", whyItMatters: "Essas entradas mostram como a interação começa." },
    { id: "permissions", title: "Permissões e capacidades", question: "O que esta pessoa ou sistema pode fazer?", whyItMatters: "Quem usa o sistema pode precisar de permissões diferentes." },
  ],
};

export interface Decision { id: string; title: string; reason: string; status: DecisionStatus }
export interface DesignEntity {
  id: string;
  kind: SemanticKind;
  name: string;
  technology: string;
  purpose: string;
  notes: string;
  considerationStates: Record<string, ConsiderationStatus>;
  decisions: Decision[];
}
export interface DesignRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  kind: RelationshipKind;
  notes: string;
}
export interface SystemContext {
  systemName: string; purpose: string;
  registeredUsers: string; dailyActiveUsers: string; peakConcurrentUsers: string; peakRequestsPerSecond: string;
  availabilityTarget: string; latencyTarget: string;
  dataSensitivity: string; budgetConstraint: string; deploymentConstraint: string;
  assumptions: string[];
}
export interface DesignDocument {
  schemaVersion: 2;
  nextId: number;
  systemContext: SystemContext;
  entities: DesignEntity[];
  relationships: DesignRelationship[];
}
export interface LayoutNode { entityId: string; x: number; y: number }
export interface LayoutDocument {
  schemaVersion: 1;
  nodes: LayoutNode[];
  viewport: { x: number; y: number; zoom: number };
}
export interface DesignSnapshot { design: DesignDocument; layout: LayoutDocument }

export function createDesignDocument(): DesignDocument {
  return { schemaVersion: 2, nextId: 1, systemContext: {
    systemName: "", purpose: "", registeredUsers: "", dailyActiveUsers: "", peakConcurrentUsers: "", peakRequestsPerSecond: "",
    availabilityTarget: "", latencyTarget: "", dataSensitivity: "", budgetConstraint: "", deploymentConstraint: "", assumptions: [],
  }, entities: [], relationships: [] };
}
export function createLayoutDocument(): LayoutDocument {
  return { schemaVersion: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

export function createEntity(document: DesignDocument, kind: SemanticKind, name = "Sem nome"): { document: DesignDocument; entity: DesignEntity } {
  const entity: DesignEntity = { id: `entity:${document.nextId}`, kind, name, technology: "", purpose: "", notes: "", considerationStates: {}, decisions: [] };
  return { document: { ...document, nextId: document.nextId + 1, entities: [...document.entities, entity] }, entity };
}
export function updateEntity(document: DesignDocument, entity: DesignEntity): DesignDocument {
  if (!document.entities.some((current) => current.id === entity.id)) throw new Error("Entity does not exist.");
  if (!entity.name.trim()) throw new Error("Entity name cannot be empty.");
  return { ...document, entities: document.entities.map((current) => current.id === entity.id ? entity : current) };
}
export function deleteEntity(document: DesignDocument, entityId: string): DesignDocument {
  if (!document.entities.some((entity) => entity.id === entityId)) return document;
  return { ...document, entities: document.entities.filter((entity) => entity.id !== entityId),
    relationships: document.relationships.filter((relation) => relation.sourceEntityId !== entityId && relation.targetEntityId !== entityId) };
}
export function duplicateEntity(document: DesignDocument, entityId: string): { document: DesignDocument; entity: DesignEntity } {
  const original = document.entities.find((entity) => entity.id === entityId);
  if (!original) throw new Error("Entity does not exist.");
  let nextId = document.nextId;
  const decisions = original.decisions.map((decision) => ({ ...decision, id: `decision:${nextId++}` }));
  const entity: DesignEntity = { ...original, id: `entity:${nextId++}`, name: `${original.name} (cópia)`,
    considerationStates: { ...original.considerationStates }, decisions };
  return { document: { ...document, nextId, entities: [...document.entities, entity] }, entity };
}
export function createRelationship(document: DesignDocument, sourceEntityId: string, targetEntityId: string, kind: RelationshipKind = "generic"): { document: DesignDocument; relationship: DesignRelationship } {
  if (sourceEntityId === targetEntityId || !document.entities.some((entity) => entity.id === sourceEntityId) || !document.entities.some((entity) => entity.id === targetEntityId)) {
    throw new Error("A relationship needs two existing, distinct entities.");
  }
  const relationship: DesignRelationship = { id: `relationship:${document.nextId}`, sourceEntityId, targetEntityId, kind, notes: "" };
  return { document: { ...document, nextId: document.nextId + 1, relationships: [...document.relationships, relationship] }, relationship };
}
export function updateRelationship(document: DesignDocument, relationship: DesignRelationship): DesignDocument {
  if (!document.relationships.some((current) => current.id === relationship.id && current.sourceEntityId === relationship.sourceEntityId && current.targetEntityId === relationship.targetEntityId)) {
    throw new Error("Relationship does not exist or endpoints changed.");
  }
  return { ...document, relationships: document.relationships.map((current) => current.id === relationship.id ? relationship : current) };
}
export function deleteRelationship(document: DesignDocument, relationshipId: string): DesignDocument {
  return { ...document, relationships: document.relationships.filter((relationship) => relationship.id !== relationshipId) };
}
export function setConsiderationStatus(document: DesignDocument, entityId: string, considerationId: string, status: ConsiderationStatus): DesignDocument {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (!entity || !CONSIDERATIONS[entity.kind].some((item) => item.id === considerationId)) throw new Error("Consideration does not apply to this entity.");
  return updateEntity(document, { ...entity, considerationStates: { ...entity.considerationStates, [considerationId]: status } });
}
export function addDecision(document: DesignDocument, entityId: string, title: string, reason: string, status: DecisionStatus): DesignDocument {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error("Entity does not exist.");
  if (!title.trim()) throw new Error("Decision title cannot be empty.");
  const decision: Decision = { id: `decision:${document.nextId}`, title: title.trim(), reason: reason.trim(), status };
  return { ...document, nextId: document.nextId + 1, entities: document.entities.map((candidate) => candidate.id === entityId ?
    { ...candidate, decisions: [...candidate.decisions, decision] } : candidate) };
}

export function parseDesignDocument(value: unknown): DesignDocument {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Number.isSafeInteger(value.nextId) || Number(value.nextId) < 1 ||
    !isSystemContext(value.systemContext) || !Array.isArray(value.entities) || !Array.isArray(value.relationships)) throw new Error("Invalid Studio V1 design document.");
  const entities: unknown[] = value.entities;
  const relationships: unknown[] = value.relationships;
  if (!entities.every(isEntity) || !relationships.every(isRelationship)) throw new Error("Invalid entity or relationship.");
  const ids = new Set<string>();
  const decisionIds = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) throw new Error("Duplicate entity ID.");
    ids.add(entity.id);
    for (const decision of entity.decisions) {
      if (decisionIds.has(decision.id)) throw new Error("Duplicate decision ID.");
      decisionIds.add(decision.id);
    }
  }
  const relationshipIds = new Set<string>();
  for (const relationship of relationships) {
    if (relationshipIds.has(relationship.id) || !ids.has(relationship.sourceEntityId) || !ids.has(relationship.targetEntityId) || relationship.sourceEntityId === relationship.targetEntityId) {
      throw new Error("Invalid relationship references or duplicate ID.");
    }
    relationshipIds.add(relationship.id);
  }
  const allIds = [...ids, ...relationshipIds, ...entities.flatMap((entity) => entity.decisions.map((decision) => decision.id))];
  if (allIds.some((id) => Number(id.split(":")[1]) >= Number(value.nextId))) throw new Error("Invalid next ID.");
  return { schemaVersion: 2, nextId: Number(value.nextId), systemContext: value.systemContext, entities, relationships };
}
export function parseLayoutDocument(value: unknown, design: DesignDocument): LayoutDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.nodes) || !isRecord(value.viewport)) throw new Error("Invalid Studio layout document.");
  const nodes: unknown[] = value.nodes;
  if (!nodes.every(isLayoutNode) || !isFiniteNumber(value.viewport.x) || !isFiniteNumber(value.viewport.y) || !isFiniteNumber(value.viewport.zoom) || value.viewport.zoom <= 0) {
    throw new Error("Invalid layout positions or viewport.");
  }
  const ids = new Set(nodes.map((node) => node.entityId));
  if (ids.size !== nodes.length || ids.size !== design.entities.length || design.entities.some((entity) => !ids.has(entity.id))) throw new Error("Layout does not match design entities.");
  return { schemaVersion: 1, nodes, viewport: { x: value.viewport.x, y: value.viewport.y, zoom: value.viewport.zoom } };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isSemanticKind(value: unknown): value is SemanticKind { return typeof value === "string" && SEMANTIC_KINDS.some((kind) => kind === value); }
function isRelationshipKind(value: unknown): value is RelationshipKind { return typeof value === "string" && RELATIONSHIP_KINDS.some((kind) => kind === value); }
function isDecisionStatus(value: unknown): value is DecisionStatus { return value === "open" || value === "accepted" || value === "rejected"; }
function isConsiderationStatus(value: unknown): value is ConsiderationStatus { return value === "unreviewed" || value === "considered" || value === "not-relevant"; }
function isDecision(value: unknown): value is Decision { return isRecord(value) && typeof value.id === "string" && /^decision:\d+$/.test(value.id) && typeof value.title === "string" && !!value.title.trim() && typeof value.reason === "string" && isDecisionStatus(value.status); }
function isEntity(value: unknown): value is DesignEntity {
  const kind = isRecord(value) ? value.kind : undefined;
  if (!isRecord(value) || typeof value.id !== "string" || !/^entity:\d+$/.test(value.id) || !isSemanticKind(value.kind) ||
    typeof value.name !== "string" || !value.name.trim() || typeof value.technology !== "string" || typeof value.purpose !== "string" ||
    typeof value.notes !== "string" || !isRecord(value.considerationStates) || !Array.isArray(value.decisions)) return false;
  if (!isSemanticKind(kind)) return false;
  return Object.entries(value.considerationStates).every(([id, status]) => CONSIDERATIONS[kind].some((item) => item.id === id) && isConsiderationStatus(status)) && value.decisions.every(isDecision);
}
function isRelationship(value: unknown): value is DesignRelationship { return isRecord(value) && typeof value.id === "string" && /^relationship:\d+$/.test(value.id) && typeof value.sourceEntityId === "string" && typeof value.targetEntityId === "string" && isRelationshipKind(value.kind) && typeof value.notes === "string"; }
function isLayoutNode(value: unknown): value is LayoutNode { return isRecord(value) && typeof value.entityId === "string" && isFiniteNumber(value.x) && isFiniteNumber(value.y); }
function isSystemContext(value: unknown): value is SystemContext {
  if (!isRecord(value) || !Array.isArray(value.assumptions) || !value.assumptions.every((item: unknown) => typeof item === "string")) return false;
  const fields: Array<keyof Omit<SystemContext, "assumptions">> = ["systemName", "purpose", "registeredUsers", "dailyActiveUsers", "peakConcurrentUsers", "peakRequestsPerSecond", "availabilityTarget", "latencyTarget", "dataSensitivity", "budgetConstraint", "deploymentConstraint"];
  return fields.every((field) => typeof value[field] === "string");
}
export { createHistory, commitHistory, replacePresentHistory, discardLastHistory, undoHistory, redoHistory } from "./history";
export type { DesignHistory } from "./history";
