import assert from "node:assert/strict";
import test from "node:test";
import { addDecision, commitHistory, CONSIDERATIONS, createDesignDocument, createEntity, createHistory, createLayoutDocument, createRelationship,
  deleteEntity, duplicateEntity, parseDesignDocument, parseLayoutDocument, redoHistory, setConsiderationStatus, undoHistory, updateEntity, updateRelationship } from "../packages/design-model/src/index";

test("entities and relationships keep architectural identity independent of positions", () => {
  const first = createEntity(createDesignDocument(), "component", "Authentication");
  const second = createEntity(first.document, "data-store", "User Database");
  const updated = updateEntity(second.document, { ...first.entity, purpose: "Authenticates users" });
  const linked = createRelationship(updated, first.entity.id, second.entity.id);
  const classified = updateRelationship(linked.document, { ...linked.relationship, kind: "reads-writes" });
  const layout = { ...createLayoutDocument(), nodes: [{ entityId: first.entity.id, x: 100, y: 200 }, { entityId: second.entity.id, x: 430, y: 200 }] };
  assert.equal(classified.relationships[0]?.kind, "reads-writes");
  assert.equal(classified.entities[0]?.purpose, "Authenticates users");
  assert.deepEqual(parseDesignDocument(JSON.parse(JSON.stringify(classified))), classified);
  assert.deepEqual(parseLayoutDocument(JSON.parse(JSON.stringify(layout)), classified), layout);
  assert.deepEqual(deleteEntity(classified, first.entity.id).relationships, []);
  assert.equal(layout.nodes[0]?.entityId, first.entity.id);
});

test("duplication allocates an independent identity and decisions and consideration state survive serialization", () => {
  const created = createEntity(createDesignDocument(), "queue-event", "Order events");
  const reviewed = setConsiderationStatus(created.document, created.entity.id, "duplicate-delivery", "considered");
  const decided = addDecision(reviewed, created.entity.id, "Retry failures", "Transient failures", "accepted");
  const copy = duplicateEntity(decided, created.entity.id);
  assert.notEqual(copy.entity.id, created.entity.id);
  assert.notEqual(copy.entity.decisions[0]?.id, decided.entities[0]?.decisions[0]?.id);
  assert.equal(copy.entity.considerationStates["duplicate-delivery"], "considered");
  assert.ok(CONSIDERATIONS["queue-event"].some((item) => item.id === "duplicate-delivery" && item.whyItMatters.length > 0));
  assert.deepEqual(parseDesignDocument(JSON.parse(JSON.stringify(copy.document))), copy.document);
});

test("history restores deleted knowledge, positions and later edits as one snapshot", () => {
  const first = createEntity(createDesignDocument(), "component", "Authentication");
  const withDecision = addDecision(first.document, first.entity.id, "Use sessions", "Browser clients", "open");
  const layout = { ...createLayoutDocument(), nodes: [{ entityId: first.entity.id, x: 80, y: 120 }] };
  const saved = { design: withDecision, layout };
  const deleted = { design: deleteEntity(withDecision, first.entity.id), layout: { ...layout, nodes: [] } };
  const history = commitHistory(createHistory(saved), deleted);
  const restored = undoHistory(history);
  assert.equal(restored.present.design.entities[0]?.decisions[0]?.title, "Use sessions");
  assert.deepEqual(restored.present.layout.nodes, layout.nodes);
  assert.deepEqual(redoHistory(restored).present, deleted);
});

test("invalid documents reject dangling links, malformed considerations, duplicate IDs and mismatched layout", () => {
  const first = createEntity(createDesignDocument(), "component", "A");
  const second = createEntity(first.document, "component", "B");
  const relation = createRelationship(second.document, first.entity.id, second.entity.id).document;
  assert.throws(() => parseDesignDocument({ ...relation, relationships: [{ ...relation.relationships[0], targetEntityId: "missing" }] }));
  assert.throws(() => parseDesignDocument({ ...relation, entities: [first.entity, first.entity] }));
  assert.throws(() => parseDesignDocument({ ...relation, entities: [{ ...first.entity, considerationStates: { ordering: "considered" } }, second.entity] }));
  const decision = addDecision(relation, first.entity.id, "A decision", "Reason", "open");
  const author = decision.entities[0];
  assert.ok(author);
  assert.throws(() => parseDesignDocument({ ...decision, entities: [author, { ...second.entity, decisions: author.decisions }] }));
  assert.throws(() => parseDesignDocument({ ...relation, schemaVersion: 1 }));
  assert.throws(() => parseLayoutDocument(createLayoutDocument(), relation));
});
