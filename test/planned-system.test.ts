import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlannedSystemModel } from '../packages/contracts/src/index.js';
import { createPlannedSystemModel, validatePlannedSystemModel } from '../packages/planned-system/src/index.js';

type Path = (string | number)[];

function expectInvalid(value: unknown, code: string, path: Path): void {
  const result = validatePlannedSystemModel(value);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((error) => error.code === code && JSON.stringify(error.path) === JSON.stringify(path)),
    `Expected ${code} at ${path.join('.')}: ${JSON.stringify(result.errors)}`);
}

function exampleSaas(): PlannedSystemModel {
  const model = createPlannedSystemModel({ id: 'model-1', representedSystem: 'Example SaaS' });
  model.parts = [
    { id: 'api', label: 'API' },
    { id: 'auth', label: 'Authentication' },
    { id: 'users', label: 'Users' },
    { id: 'persistence', label: 'Persistence' },
  ];
  model.predicates = [
    { id: 'depends', label: 'depends on', description: 'The source Part depends on the target Part.' },
    { id: 'accesses', label: 'accesses', description: 'The source Part accesses the target Part.' },
  ];
  model.relations = [
    { id: 'relation-api-auth', sourcePartId: 'api', targetPartId: 'auth', predicateId: 'depends',
      description: 'Protected API calls use authentication.', rationale: 'Protect customer data.', reference: 'ADR-42' },
    { id: 'relation-auth-db', sourcePartId: 'auth', targetPartId: 'persistence', predicateId: 'accesses' },
    { id: 'relation-users-db', sourcePartId: 'users', targetPartId: 'persistence', predicateId: 'accesses' },
  ];
  model.claims = [{ id: 'claim-auth', subject: { kind: 'model' }, modality: 'required',
    statement: 'Protected operations require authentication.', rationale: 'Customer data is protected.', reference: 'REQ-7' }];
  model.openQuestions = [{ id: 'question-notifications', subject: { kind: 'model' },
    question: 'How will notifications be delivered?', rationale: 'Delivery mechanism is undecided.', reference: 'TICKET-9' }];
  return model;
}

test('creates a valid blank canvas with explicit or generated identity', () => {
  const model = createPlannedSystemModel({ id: 'model-1', representedSystem: 'Blank System' });
  assert.deepEqual(model, {
    schemaVersion: 1, id: 'model-1', context: { nature: 'planned-intention', representedSystem: 'Blank System' },
    parts: [], predicates: [], relations: [], claims: [], openQuestions: [],
  });
  assert.deepEqual(validatePlannedSystemModel(model), { ok: true, value: model });

  const generated = createPlannedSystemModel({ representedSystem: 'Blank System' });
  assert.ok(generated.id.length > 0);
  assert.equal(validatePlannedSystemModel(generated).ok, true);
  assert.equal('scope' in generated.context, false);
  assert.deepEqual(createPlannedSystemModel({ id: 'scoped', representedSystem: 'Blank System', scope: 'Authentication' }).context,
    { nature: 'planned-intention', representedSystem: 'Blank System', scope: 'Authentication' });
  assert.throws(() => createPlannedSystemModel({ id: 'bad id', representedSystem: 'Blank System' }), /Invalid planned model input at id/);
  assert.throws(() => createPlannedSystemModel({ representedSystem: ' Blank System ' }), /representedSystem/);
  assert.throws(() => createPlannedSystemModel({ id: undefined, representedSystem: 'Blank System' }), /Invalid planned model input at id/);
  assert.throws(() => createPlannedSystemModel({ representedSystem: 'Blank System', scope: undefined }), /scope/);
});

test('accepts a code-free Example SaaS and preserves authored IDs, order and references through JSON', () => {
  const model = exampleSaas();
  const result = validatePlannedSystemModel(model);
  assert.equal(result.ok, true);
  const parsed: unknown = JSON.parse(JSON.stringify(model));
  const roundTrip = validatePlannedSystemModel(parsed);
  assert.deepEqual(roundTrip, { ok: true, value: model });
  if (roundTrip.ok) {
    assert.deepEqual(roundTrip.value.parts.map((part) => part.id), ['api', 'auth', 'users', 'persistence']);
    assert.deepEqual(roundTrip.value.relations.map((relation) =>
      [relation.sourcePartId, relation.predicateId, relation.targetPartId]), [
      ['api', 'depends', 'auth'], ['auth', 'accesses', 'persistence'], ['users', 'accesses', 'persistence'],
    ]);
    assert.deepEqual(roundTrip.value.claims, model.claims);
    assert.deepEqual(roundTrip.value.openQuestions, model.openQuestions);
  }
});

test('rejects invalid IDs and untrimmed or blank authored text without repairing input', () => {
  const model = exampleSaas();
  for (const id of ['', '   ', 'bad id', 'bad\nid', 'bad\u007fid']) {
    expectInvalid({ ...model, id }, 'invalid_id', ['id']);
  }
  for (const id of ['model-1', 'auth', 'relation-auth-db']) {
    assert.equal(validatePlannedSystemModel({ ...model, id }).ok, true);
  }
  expectInvalid({ ...model, context: { ...model.context, representedSystem: ' ' } }, 'invalid_text', ['context', 'representedSystem']);
  expectInvalid({ ...model, context: { ...model.context, scope: '' } }, 'invalid_text', ['context', 'scope']);
  expectInvalid({ ...model, parts: [{ ...model.parts[0], label: ' API ' }, ...model.parts.slice(1)] }, 'invalid_text', ['parts', 0, 'label']);
  expectInvalid({ ...model, parts: [{ ...model.parts[0], description: '' }, ...model.parts.slice(1)] }, 'invalid_text', ['parts', 0, 'description']);
  expectInvalid({ ...model, predicates: [{ ...model.predicates[0], description: '' }, model.predicates[1]] }, 'invalid_text', ['predicates', 0, 'description']);
  expectInvalid({ ...model, claims: [{ ...model.claims[0], statement: '' }] }, 'invalid_text', ['claims', 0, 'statement']);
  expectInvalid({ ...model, openQuestions: [{ ...model.openQuestions[0], question: '' }] }, 'invalid_text', ['openQuestions', 0, 'question']);
  expectInvalid({ ...model, relations: [{ ...model.relations[0], reference: '' }, ...model.relations.slice(1)] }, 'invalid_text', ['relations', 0, 'reference']);
  expectInvalid({ ...model, claims: [{ ...model.claims[0], rationale: ' why ' }] }, 'invalid_text', ['claims', 0, 'rationale']);
});

test('rejects broken relation endpoints, predicates and typed subjects', () => {
  const model = exampleSaas();
  const relation = model.relations[0];
  const claim = model.claims[0];
  const question = model.openQuestions[0];
  assert.ok(relation && claim && question);
  expectInvalid({ ...model, relations: [{ ...relation, sourcePartId: 'missing' }, ...model.relations.slice(1)] }, 'broken_reference', ['relations', 0, 'sourcePartId']);
  expectInvalid({ ...model, relations: [{ ...relation, targetPartId: 'missing' }, ...model.relations.slice(1)] }, 'broken_reference', ['relations', 0, 'targetPartId']);
  expectInvalid({ ...model, relations: [{ ...relation, predicateId: 'missing' }, ...model.relations.slice(1)] }, 'broken_reference', ['relations', 0, 'predicateId']);
  expectInvalid({ ...model, claims: [{ ...claim, subject: { kind: 'part', partId: 'missing' } }] }, 'broken_reference', ['claims', 0, 'subject', 'partId']);
  expectInvalid({ ...model, claims: [{ ...claim, subject: { kind: 'relation', relationId: 'missing' } }] }, 'broken_reference', ['claims', 0, 'subject', 'relationId']);
  expectInvalid({ ...model, openQuestions: [{ ...question, subject: { kind: 'part', partId: 'missing' } }] }, 'broken_reference', ['openQuestions', 0, 'subject', 'partId']);
  expectInvalid({ ...model, openQuestions: [{ ...question, subject: { kind: 'relation', relationId: 'missing' } }] }, 'broken_reference', ['openQuestions', 0, 'subject', 'relationId']);
  assert.equal(validatePlannedSystemModel({ ...model, openQuestions: [{ ...question, subject: { kind: 'relation', relationId: relation.id } }] }).ok, true);
  expectInvalid({ ...model, relations: model.relations.slice(1), openQuestions: [{ ...question, subject: { kind: 'relation', relationId: relation.id } }] },
    'broken_reference', ['openQuestions', 0, 'subject', 'relationId']);
});

test('uses local record IDs and a unique directed triple without treating labels as identities', () => {
  const model = exampleSaas();
  const collections = ['parts', 'predicates', 'relations', 'claims', 'openQuestions'] as const;
  for (const collection of collections) {
    const records = model[collection];
    expectInvalid({ ...model, [collection]: [...records, records[0]] }, 'duplicate_id', [collection, records.length, 'id']);
  }
  const sameTriple = { ...model.relations[0]!, id: 'another-relation' };
  expectInvalid({ ...model, relations: [...model.relations, sameTriple] }, 'duplicate_relation', ['relations', 3]);

  const distinct = structuredClone(model);
  distinct.parts.push({ id: 'another-auth', label: 'Authentication' });
  distinct.predicates.push({ id: 'another-accesses', label: 'accesses', description: 'The source reaches the target through an interface.' });
  distinct.relations.push(
    { id: 'api-accesses-auth', sourcePartId: 'api', targetPartId: 'auth', predicateId: 'accesses' },
    { id: 'auth-depends-api', sourcePartId: 'auth', targetPartId: 'api', predicateId: 'depends' },
    { id: 'auth-depends-auth', sourcePartId: 'auth', targetPartId: 'auth', predicateId: 'depends' },
  );
  distinct.predicates[0]!.label = 'requires';
  distinct.parts[1]!.label = 'Identity';
  distinct.parts[4]!.label = 'Identity';
  distinct.claims.push({ id: 'same-text', subject: { kind: 'model' }, modality: 'prohibited', statement: distinct.claims[0]!.statement });
  distinct.openQuestions.push({ id: 'same-question', subject: { kind: 'model' }, question: distinct.openQuestions[0]!.question });
  assert.equal(validatePlannedSystemModel(distinct).ok, true);
  assert.equal(distinct.relations[0]?.predicateId, 'depends');
  assert.equal(distinct.relations[0]?.targetPartId, 'auth');
  const localIds = structuredClone(model);
  localIds.relations[0]!.id = 'auth';
  assert.equal(validatePlannedSystemModel(localIds).ok, true);
});

test('rejects unknown fields at every model level and unsupported versions', () => {
  const model = exampleSaas();
  expectInvalid({ ...model, schemaVersion: 2 }, 'invalid_value', ['schemaVersion']);
  expectInvalid({ ...model, camera: {} }, 'unknown_field', ['camera']);
  expectInvalid({ ...model, context: { ...model.context, status: 'draft' } }, 'unknown_field', ['context', 'status']);
  expectInvalid({ ...model, parts: [{ ...model.parts[0], x: 10, y: 20 }, ...model.parts.slice(1)] }, 'unknown_field', ['parts', 0, 'x']);
  expectInvalid({ ...model, predicates: [{ ...model.predicates[0], sourceRole: 'caller' }, ...model.predicates.slice(1)] }, 'unknown_field', ['predicates', 0, 'sourceRole']);
  expectInvalid({ ...model, relations: [{ ...model.relations[0], position: 2 }, ...model.relations.slice(1)] }, 'unknown_field', ['relations', 0, 'position']);
  expectInvalid({ ...model, claims: [{ ...model.claims[0], evidence: [] }] }, 'unknown_field', ['claims', 0, 'evidence']);
  expectInvalid({ ...model, openQuestions: [{ ...model.openQuestions[0], resolution: 'done' }] }, 'unknown_field', ['openQuestions', 0, 'resolution']);
  expectInvalid({ ...model, claims: [{ ...model.claims[0], subject: { kind: 'model', partId: 'auth' } }] }, 'unknown_field', ['claims', 0, 'subject', 'partId']);
  expectInvalid({ ...model, claims: [{ ...model.claims[0], subject: { kind: 'predicate', predicateId: 'depends' } }] }, 'invalid_value', ['claims', 0, 'subject', 'kind']);
});

test('authoring operations preserve identity, author order and validity without mutating their inputs', async () => {
  const author = await import('../packages/planned-system/src/index.js');
  const original = exampleSaas();
  const before = JSON.stringify(original);
  let model = author.updatePlannedContext(original, { nature: 'planned-intention', representedSystem: 'Future Project', scope: 'Initial release' });
  model = author.savePlannedPart(model, { id: 'auth', label: 'Identity', description: 'Authentication boundary' });
  assert.deepEqual(model.parts.map((part) => part.id), original.parts.map((part) => part.id));
  model = author.savePlannedPart(model, { id: 'notifications', label: 'Notifications' });
  model = author.savePlannedRelation(model, { id: 'notify', sourcePartId: 'api', targetPartId: 'notifications', predicateId: 'sends' }, { id: 'sends', label: 'sends to', description: 'Source sends an event to target.' });
  model = author.savePlannedRelation(model, { ...model.relations[0]!, targetPartId: 'users', rationale: 'Shared identity' });
  model = author.savePlannedPredicate(model, { id: 'depends', label: 'requires', description: 'Source requires target.' });
  model = author.savePlannedClaim(model, { id: 'claim-auth', subject: { kind: 'relation', relationId: 'notify' }, modality: 'assumed', statement: 'Delivery is asynchronous.' });
  model = author.savePlannedOpenQuestion(model, { id: 'question-notifications', subject: { kind: 'part', partId: 'notifications' }, question: 'Which transport?' });
  assert.equal(validatePlannedSystemModel(model).ok, true);
  assert.deepEqual(author.requireValidPlannedSystem(JSON.parse(JSON.stringify(model))), model);
  assert.equal(model.relations[0]?.id, 'relation-api-auth');
  assert.equal(model.relations[0]?.targetPartId, 'users');
  assert.equal(model.claims[0]?.modality, 'assumed');
  assert.equal(JSON.stringify(original), before);
  model = author.removePlannedClaim(model, 'claim-auth');
  model = author.removePlannedOpenQuestion(model, 'question-notifications');
  assert.equal(model.claims.length, 0);
  assert.equal(model.openQuestions.length, 0);
});

test('failed authoring is atomic, including an inline predicate, broken subjects and duplicate directed relations', async () => {
  const author = await import('../packages/planned-system/src/index.js');
  const model = exampleSaas();
  const before = JSON.stringify(model);
  assert.throws(() => author.savePlannedRelation(model, { id: 'new', sourcePartId: 'missing', targetPartId: 'auth', predicateId: 'inline' }, { id: 'inline', label: 'uses', description: 'Uses target.' }), /Source Part does not exist/);
  assert.throws(() => author.savePlannedRelation(model, { ...model.relations[0]!, id: 'duplicate' }), /triple already exists/);
  assert.throws(() => author.savePlannedClaim(model, { id: 'bad', subject: { kind: 'part', partId: 'missing' }, modality: 'required', statement: 'Must exist.' }), /subject does not exist/);
  assert.throws(() => author.savePlannedPart(model, { id: 'api', label: '' }), /nonblank/);
  assert.throws(() => author.removePlannedPart(model, 'missing'), /does not exist/);
  assert.equal(JSON.stringify(model), before);
});

test('Part removal cascades only dependent relations and their typed subjects; predicate removal is blocked while in use', async () => {
  const author = await import('../packages/planned-system/src/index.js');
  let model = exampleSaas();
  for (const subject of [{ kind: 'part', partId: 'auth' }, { kind: 'relation', relationId: 'relation-api-auth' }, { kind: 'relation', relationId: 'relation-auth-db' }, { kind: 'part', partId: 'users' }] as const) {
    const id = JSON.stringify(subject);
    model = author.savePlannedClaim(model, { id, subject, modality: 'prohibited', statement: 'No direct access.' });
    model = author.savePlannedOpenQuestion(model, { id, subject, question: 'Which boundary?' });
  }
  const original = structuredClone(model);
  assert.throws(() => author.removePlannedPredicate(model, 'accesses'), /in use/);
  model = author.removePlannedPart(model, 'auth');
  assert.deepEqual(model.relations.map((relation) => relation.id), ['relation-users-db']);
  assert.deepEqual(model.claims.map((claim) => claim.subject), [{ kind: 'model' }, { kind: 'part', partId: 'users' }]);
  assert.deepEqual(model.openQuestions.map((question) => question.subject), [{ kind: 'model' }, { kind: 'part', partId: 'users' }]);
  assert.equal(validatePlannedSystemModel(model).ok, true);
  model = author.removePlannedPredicate(model, 'depends');
  assert.equal(model.predicates.length, 1);
  const removedRelation = author.removePlannedRelation(original, 'relation-api-auth');
  assert.ok(removedRelation.claims.some((claim) => claim.subject.kind === 'part' && claim.subject.partId === 'auth'));
  assert.ok(!removedRelation.openQuestions.some((question) => question.subject.kind === 'relation' && question.subject.relationId === 'relation-api-auth'));
  assert.equal(validatePlannedSystemModel(removedRelation).ok, true);
});
