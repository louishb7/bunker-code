import type {
  PlannedClaim,
  PlannedOpenQuestion,
  PlannedPart,
  PlannedPredicateDefinition,
  PlannedRelation,
  PlannedSubjectRef,
  PlannedSystemModel,
} from '@bunker-code/contracts';

type ValidationPath = (string | number)[];

export interface PlannedSystemValidationError {
  code: 'invalid_type' | 'invalid_value' | 'invalid_text' | 'invalid_id' | 'unknown_field' | 'duplicate_id' | 'duplicate_relation' | 'broken_reference';
  path: ValidationPath;
  message: string;
}

export type PlannedSystemValidationResult =
  | { ok: true; value: PlannedSystemModel }
  | { ok: false; errors: PlannedSystemValidationError[] };

type Errors = PlannedSystemValidationError[];
type Parser<T> = (value: unknown, path: ValidationPath, errors: Errors) => T | undefined;

function addError(errors: Errors, code: PlannedSystemValidationError['code'], path: ValidationPath, message: string): void {
  errors.push({ code, path, message });
}

function asRecord(value: unknown, path: ValidationPath, errors: Errors): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    addError(errors, 'invalid_type', path, 'Expected a plain object.');
    return undefined;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    addError(errors, 'invalid_type', path, 'Expected a plain object.');
    return undefined;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))) {
      addError(errors, 'invalid_type', [...path, String(key)], 'Expected an enumerable data property.');
      return undefined;
    }
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(record: Record<string, unknown>, allowed: readonly string[], path: ValidationPath, errors: Errors): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      addError(errors, 'unknown_field', [...path, String(key)], 'Field is not part of Planned System Model schema version 1.');
    }
  }
}

function readText(value: unknown, path: ValidationPath, errors: Errors): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    addError(errors, 'invalid_text', path, 'Expected a nonblank string without surrounding whitespace.');
    return undefined;
  }
  return value;
}

function optionalText(record: Record<string, unknown>, key: string, path: ValidationPath, errors: Errors): string | undefined {
  return Object.hasOwn(record, key) ? readText(record[key], [...path, key], errors) : undefined;
}

const opaqueId = /^[^\s\u0000-\u001f\u007f-\u009f]+$/u;

function readId(value: unknown, path: ValidationPath, errors: Errors): string | undefined {
  if (typeof value !== 'string' || !opaqueId.test(value)) {
    addError(errors, 'invalid_id', path, 'Expected a nonempty opaque ID without whitespace or control characters.');
    return undefined;
  }
  return value;
}

function parseContext(value: unknown, path: ValidationPath, errors: Errors): PlannedSystemModel['context'] | undefined {
  const record = asRecord(value, path, errors);
  if (!record) return undefined;
  rejectUnknownFields(record, ['nature', 'representedSystem', 'scope'], path, errors);
  if (record.nature !== 'planned-intention') {
    addError(errors, 'invalid_value', [...path, 'nature'], 'Expected planned-intention.');
  }
  const representedSystem = readText(record.representedSystem, [...path, 'representedSystem'], errors);
  const scope = optionalText(record, 'scope', path, errors);
  if (record.nature !== 'planned-intention' || representedSystem === undefined) return undefined;
  return { nature: 'planned-intention', representedSystem, ...(scope === undefined ? {} : { scope }) };
}

function parsePart(value: unknown, path: ValidationPath, errors: Errors): PlannedPart | undefined {
  const record = asRecord(value, path, errors);
  if (!record) return undefined;
  rejectUnknownFields(record, ['id', 'label', 'description'], path, errors);
  const id = readId(record.id, [...path, 'id'], errors);
  const label = readText(record.label, [...path, 'label'], errors);
  const description = optionalText(record, 'description', path, errors);
  if (id === undefined || label === undefined) return undefined;
  return { id, label, ...(description === undefined ? {} : { description }) };
}

function parsePredicate(value: unknown, path: ValidationPath, errors: Errors): PlannedPredicateDefinition | undefined {
  const record = asRecord(value, path, errors);
  if (!record) return undefined;
  rejectUnknownFields(record, ['id', 'label', 'description'], path, errors);
  const id = readId(record.id, [...path, 'id'], errors);
  const label = readText(record.label, [...path, 'label'], errors);
  const description = readText(record.description, [...path, 'description'], errors);
  if (id === undefined || label === undefined || description === undefined) return undefined;
  return { id, label, description };
}

function parseRelation(value: unknown, path: ValidationPath, errors: Errors): PlannedRelation | undefined {
  const record = asRecord(value, path, errors);
  if (!record) return undefined;
  rejectUnknownFields(record, ['id', 'sourcePartId', 'targetPartId', 'predicateId', 'description', 'rationale', 'reference'], path, errors);
  const id = readId(record.id, [...path, 'id'], errors);
  const sourcePartId = readId(record.sourcePartId, [...path, 'sourcePartId'], errors);
  const targetPartId = readId(record.targetPartId, [...path, 'targetPartId'], errors);
  const predicateId = readId(record.predicateId, [...path, 'predicateId'], errors);
  const description = optionalText(record, 'description', path, errors);
  const rationale = optionalText(record, 'rationale', path, errors);
  const reference = optionalText(record, 'reference', path, errors);
  if (id === undefined || sourcePartId === undefined || targetPartId === undefined || predicateId === undefined) return undefined;
  return {
    id, sourcePartId, targetPartId, predicateId,
    ...(description === undefined ? {} : { description }),
    ...(rationale === undefined ? {} : { rationale }),
    ...(reference === undefined ? {} : { reference }),
  };
}

function parseSubject(value: unknown, path: ValidationPath, errors: Errors): PlannedSubjectRef | undefined {
  const record = asRecord(value, path, errors);
  if (!record) return undefined;
  if (record.kind === 'model') {
    rejectUnknownFields(record, ['kind'], path, errors);
    return { kind: 'model' };
  }
  if (record.kind === 'part') {
    rejectUnknownFields(record, ['kind', 'partId'], path, errors);
    const partId = readId(record.partId, [...path, 'partId'], errors);
    return partId === undefined ? undefined : { kind: 'part', partId };
  }
  if (record.kind === 'relation') {
    rejectUnknownFields(record, ['kind', 'relationId'], path, errors);
    const relationId = readId(record.relationId, [...path, 'relationId'], errors);
    return relationId === undefined ? undefined : { kind: 'relation', relationId };
  }
  rejectUnknownFields(record, ['kind'], path, errors);
  addError(errors, 'invalid_value', [...path, 'kind'], 'Expected model, part, or relation subject.');
  return undefined;
}

function parseClaim(value: unknown, path: ValidationPath, errors: Errors): PlannedClaim | undefined {
  const record = asRecord(value, path, errors);
  if (!record) return undefined;
  rejectUnknownFields(record, ['id', 'subject', 'modality', 'statement', 'rationale', 'reference'], path, errors);
  const id = readId(record.id, [...path, 'id'], errors);
  const subject = parseSubject(record.subject, [...path, 'subject'], errors);
  const modality = record.modality;
  if (modality !== 'required' && modality !== 'prohibited' && modality !== 'assumed') {
    addError(errors, 'invalid_value', [...path, 'modality'], 'Expected required, prohibited, or assumed.');
  }
  const statement = readText(record.statement, [...path, 'statement'], errors);
  const rationale = optionalText(record, 'rationale', path, errors);
  const reference = optionalText(record, 'reference', path, errors);
  if (id === undefined || subject === undefined || statement === undefined ||
      (modality !== 'required' && modality !== 'prohibited' && modality !== 'assumed')) return undefined;
  return {
    id, subject, modality, statement,
    ...(rationale === undefined ? {} : { rationale }),
    ...(reference === undefined ? {} : { reference }),
  };
}

function parseOpenQuestion(value: unknown, path: ValidationPath, errors: Errors): PlannedOpenQuestion | undefined {
  const record = asRecord(value, path, errors);
  if (!record) return undefined;
  rejectUnknownFields(record, ['id', 'subject', 'question', 'rationale', 'reference'], path, errors);
  const id = readId(record.id, [...path, 'id'], errors);
  const subject = parseSubject(record.subject, [...path, 'subject'], errors);
  const question = readText(record.question, [...path, 'question'], errors);
  const rationale = optionalText(record, 'rationale', path, errors);
  const reference = optionalText(record, 'reference', path, errors);
  if (id === undefined || subject === undefined || question === undefined) return undefined;
  return {
    id, subject, question,
    ...(rationale === undefined ? {} : { rationale }),
    ...(reference === undefined ? {} : { reference }),
  };
}

function parseCollection<T>(value: unknown, name: string, parser: Parser<T>, errors: Errors): T[] | undefined {
  if (!Array.isArray(value)) {
    addError(errors, 'invalid_type', [name], 'Expected an array.');
    return undefined;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    const index = typeof key === 'string' ? Number(key) : Number.NaN;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= value.length || String(index) !== key ||
        (descriptor !== undefined && (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')))) {
      addError(errors, 'unknown_field', [name, String(key)], 'Array contains a property outside its JSON entries.');
      return undefined;
    }
  }
  const parsed: T[] = [];
  let complete = true;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      addError(errors, 'invalid_type', [name, index], 'Array entries must be present.');
      complete = false;
      continue;
    }
    const item = parser(value[index], [name, index], errors);
    if (item === undefined) complete = false;
    else parsed.push(item);
  }
  return complete ? parsed : undefined;
}

function checkUniqueIds<T extends { id: string }>(items: T[], name: string, errors: Errors): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) addError(errors, 'duplicate_id', [name, index, 'id'], `Duplicate ${name} ID.`);
    seen.add(item.id);
  });
}

function checkSubject(subject: PlannedSubjectRef, path: ValidationPath, partIds: Set<string>, relationIds: Set<string>, errors: Errors): void {
  if (subject.kind === 'part' && !partIds.has(subject.partId)) {
    addError(errors, 'broken_reference', [...path, 'partId'], 'Part subject does not exist in this model.');
  }
  if (subject.kind === 'relation' && !relationIds.has(subject.relationId)) {
    addError(errors, 'broken_reference', [...path, 'relationId'], 'Relation subject does not exist in this model.');
  }
}

/** Checks only JSON structure and local references, never architectural meaning. */
export function validatePlannedSystemModel(value: unknown): PlannedSystemValidationResult {
  const errors: Errors = [];
  const record = asRecord(value, [], errors);
  if (!record) return { ok: false, errors };
  rejectUnknownFields(record, ['schemaVersion', 'id', 'context', 'parts', 'predicates', 'relations', 'claims', 'openQuestions'], [], errors);
  if (record.schemaVersion !== 1) {
    addError(errors, 'invalid_value', ['schemaVersion'], 'Unsupported Planned System Model schema version.');
  }
  const id = readId(record.id, ['id'], errors);
  const context = parseContext(record.context, ['context'], errors);
  const parts = parseCollection(record.parts, 'parts', parsePart, errors);
  const predicates = parseCollection(record.predicates, 'predicates', parsePredicate, errors);
  const relations = parseCollection(record.relations, 'relations', parseRelation, errors);
  const claims = parseCollection(record.claims, 'claims', parseClaim, errors);
  const openQuestions = parseCollection(record.openQuestions, 'openQuestions', parseOpenQuestion, errors);

  if (parts) checkUniqueIds(parts, 'parts', errors);
  if (predicates) checkUniqueIds(predicates, 'predicates', errors);
  if (relations) checkUniqueIds(relations, 'relations', errors);
  if (claims) checkUniqueIds(claims, 'claims', errors);
  if (openQuestions) checkUniqueIds(openQuestions, 'openQuestions', errors);

  if (parts && predicates && relations) {
    const partIds = new Set(parts.map((part) => part.id));
    const predicateIds = new Set(predicates.map((predicate) => predicate.id));
    const relationIds = new Set(relations.map((relation) => relation.id));
    const triples = new Set<string>();
    relations.forEach((relation, index) => {
      if (!partIds.has(relation.sourcePartId)) addError(errors, 'broken_reference', ['relations', index, 'sourcePartId'], 'Source Part does not exist.');
      if (!partIds.has(relation.targetPartId)) addError(errors, 'broken_reference', ['relations', index, 'targetPartId'], 'Target Part does not exist.');
      if (!predicateIds.has(relation.predicateId)) addError(errors, 'broken_reference', ['relations', index, 'predicateId'], 'Predicate does not exist.');
      const triple = JSON.stringify([relation.sourcePartId, relation.targetPartId, relation.predicateId]);
      if (triples.has(triple)) addError(errors, 'duplicate_relation', ['relations', index], 'Directed Part and predicate triple already exists.');
      triples.add(triple);
    });
    claims?.forEach((claim, index) => checkSubject(claim.subject, ['claims', index, 'subject'], partIds, relationIds, errors));
    openQuestions?.forEach((question, index) => checkSubject(question.subject, ['openQuestions', index, 'subject'], partIds, relationIds, errors));
  }

  if (errors.length > 0 || id === undefined || context === undefined || parts === undefined || predicates === undefined ||
      relations === undefined || claims === undefined || openQuestions === undefined) return { ok: false, errors };
  return { ok: true, value: { schemaVersion: 1, id, context, parts, predicates, relations, claims, openQuestions } };
}
