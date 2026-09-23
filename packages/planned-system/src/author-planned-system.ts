import type {
  PlannedClaim, PlannedOpenQuestion, PlannedPart, PlannedPredicateDefinition,
  PlannedRelation, PlannedSubjectRef, PlannedSystemModel,
} from '@bunker-code/contracts';
import { validatePlannedSystemModel } from './validate-planned-system-model.js';

/** Returns a detached model or rejects the entire operation, without repairing input. */
export function requireValidPlannedSystem(value: unknown): PlannedSystemModel {
  const result = validatePlannedSystemModel(value);
  if (!result.ok) {
    throw new TypeError(result.errors.map((error) => `${error.path.join('.') || 'model'}: ${error.message}`).join('\n'));
  }
  return result.value;
}

function edit(model: PlannedSystemModel, change: (draft: PlannedSystemModel) => void): PlannedSystemModel {
  const draft = requireValidPlannedSystem(model);
  change(draft);
  return requireValidPlannedSystem(draft);
}

function put<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  return index < 0 ? [...items, item] : items.map((existing, position) => position === index ? item : existing);
}

function requireRecord(items: { id: string }[], id: string): void {
  if (!items.some((item) => item.id === id)) throw new TypeError(`Record ${id} does not exist.`);
}

export function updatePlannedContext(model: PlannedSystemModel, context: PlannedSystemModel['context']): PlannedSystemModel {
  return edit(model, (draft) => { draft.context = context; });
}

/** Saves a complete authored record. Existing IDs retain their collection position. */
export function savePlannedPart(model: PlannedSystemModel, part: PlannedPart): PlannedSystemModel {
  return edit(model, (draft) => { draft.parts = put(draft.parts, part); });
}

export function savePlannedPredicate(model: PlannedSystemModel, predicate: PlannedPredicateDefinition): PlannedSystemModel {
  return edit(model, (draft) => { draft.predicates = put(draft.predicates, predicate); });
}

/** An inline predicate and its relation are committed atomically. */
export function savePlannedRelation(model: PlannedSystemModel, relation: PlannedRelation, newPredicate?: PlannedPredicateDefinition): PlannedSystemModel {
  return edit(model, (draft) => {
    if (newPredicate) {
      if (draft.predicates.some((item) => item.id === newPredicate.id)) throw new TypeError('Inline predicate ID already exists.');
      draft.predicates.push(newPredicate);
    }
    draft.relations = put(draft.relations, relation);
  });
}

export function savePlannedClaim(model: PlannedSystemModel, claim: PlannedClaim): PlannedSystemModel {
  return edit(model, (draft) => { draft.claims = put(draft.claims, claim); });
}

export function savePlannedOpenQuestion(model: PlannedSystemModel, question: PlannedOpenQuestion): PlannedSystemModel {
  return edit(model, (draft) => { draft.openQuestions = put(draft.openQuestions, question); });
}

function removeSubjects(draft: PlannedSystemModel, partId: string | undefined, relationIds: Set<string>): void {
  const survives = (subject: PlannedSubjectRef) => subject.kind === 'model' ||
    (subject.kind === 'part' ? subject.partId !== partId : !relationIds.has(subject.relationId));
  draft.claims = draft.claims.filter((item) => survives(item.subject));
  draft.openQuestions = draft.openQuestions.filter((item) => survives(item.subject));
}

/** Cascades only relations and annotations whose subjects cannot survive the removal. */
export function removePlannedPart(model: PlannedSystemModel, id: string): PlannedSystemModel {
  return edit(model, (draft) => {
    requireRecord(draft.parts, id);
    const removed = new Set(draft.relations.filter((item) => item.sourcePartId === id || item.targetPartId === id).map((item) => item.id));
    draft.parts = draft.parts.filter((item) => item.id !== id);
    draft.relations = draft.relations.filter((item) => !removed.has(item.id));
    removeSubjects(draft, id, removed);
  });
}

export function removePlannedRelation(model: PlannedSystemModel, id: string): PlannedSystemModel {
  return edit(model, (draft) => {
    requireRecord(draft.relations, id);
    draft.relations = draft.relations.filter((item) => item.id !== id);
    removeSubjects(draft, undefined, new Set([id]));
  });
}

/** Predicates in use must be reassigned on their relations before deletion. */
export function removePlannedPredicate(model: PlannedSystemModel, id: string): PlannedSystemModel {
  return edit(model, (draft) => {
    requireRecord(draft.predicates, id);
    if (draft.relations.some((item) => item.predicateId === id)) throw new TypeError('Predicate is in use. Reassign or remove its relations first.');
    draft.predicates = draft.predicates.filter((item) => item.id !== id);
  });
}

export function removePlannedClaim(model: PlannedSystemModel, id: string): PlannedSystemModel {
  return edit(model, (draft) => { requireRecord(draft.claims, id); draft.claims = draft.claims.filter((item) => item.id !== id); });
}

export function removePlannedOpenQuestion(model: PlannedSystemModel, id: string): PlannedSystemModel {
  return edit(model, (draft) => { requireRecord(draft.openQuestions, id); draft.openQuestions = draft.openQuestions.filter((item) => item.id !== id); });
}
