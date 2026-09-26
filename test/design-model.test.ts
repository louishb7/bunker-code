import assert from "node:assert/strict";
import test from "node:test";
import { addDecision, addEntity, CONSIDERATIONS, createDesignDocument, parseDesignDocument, reconcileCanvasElements, updateEntity } from "../packages/design-model/src/index";

test("a canvas shape has one semantic identity; deleting it cleans up its decisions", () => {
  const empty = createDesignDocument();
  const linked = addEntity(empty, "shape-1", "queue-event");
  assert.throws(() => addEntity(linked, "shape-1", "component"));
  const entity = linked.entities[0];
  assert.ok(entity);
  const withDecision = addDecision(updateEntity(linked, { ...entity, purpose: "Process orders" }), entity.id);
  const updated = updateEntity(withDecision, {
    ...withDecision.entities[0]!,
    decisions: [{ id: "decision:1", title: "Retry", reason: "Transient failure", status: "accepted" }],
  });
  assert.deepEqual(parseDesignDocument(JSON.parse(JSON.stringify(updated))), updated);
  assert.equal(updated.entities[0]?.decisions[0]?.status, "accepted");
  assert.deepEqual(reconcileCanvasElements(updated, new Set(["different-duplicated-shape"])).entities, []);
  assert.equal(empty.entities.length, 0);
});

test("considerations remain deterministic prompts and invalid saved links are rejected", () => {
  assert.ok(CONSIDERATIONS["queue-event"].some((prompt) => prompt.includes("more than once")));
  const document = addEntity(createDesignDocument(), "shape-1", "component");
  assert.throws(() => parseDesignDocument({ ...document, entities: [document.entities[0], document.entities[0]] }));
});
