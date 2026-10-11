// items-journal-10 (hardening, failure path): stash() deletes the owner's items after asking the
// container to create the copies. Foundry drops a document that fails validation without throwing,
// so a container can accept fewer copies than asked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attunementWorld, makeActor } from "./fixtures/world.mjs";

const F = await attunementWorld();
const { stash } = await import("../actor-adapter.mjs");

function owner(id) {
  return makeActor(F, { id, name: "Talo Safety",
    items: [
      { id: "c", name: "Cloak", system: { attuned: true }, source: { name: "Cloak", system: { attuned: true, attunement: "required" } } },
      { id: "t", name: "Torch", type: "loot", system: { quantity: 1 } },
    ] });
}

// [declared] items-journal-10 (was KNOWN): a container that accepts fewer copies than asked leaves
// the owner untouched — no delete, no owner update — logs one error and stash() rejects.
test("items-journal-10: a container that drops a copy: originals kept, one error, stash rejects", async () => {
  const box = makeActor(F, { id: "actorBoxS0000001", name: "Box" });
  box.createEmbeddedDocuments = async (type, data) => data.slice(1);
  const who = owner("actorSafe0000001");
  const from = F.calls.length;
  const errors = [];
  const keep = console.error;
  console.error = (...a) => errors.push(a);
  try {
    await assert.rejects(stash(who, box, ["c", "t"]), /container accepted 1\/2; originals NOT deleted/);
  } finally {
    console.error = keep;
  }
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "deleteEmbeddedDocuments" || c.op === "update"), []);
  assert.deepEqual(errors, [["pentaryn-attunement | stash: container accepted 1/2; originals NOT deleted",
    { owner: "actorSafe0000001", container: "actorBoxS0000001" }]]);
});

test("every copy created: unchanged — delete, then the owner update; resolves the count", async () => {
  const box = makeActor(F, { id: "actorBoxS0000002", name: "Box Two" });
  const who = owner("actorSafe0000002");
  const from = F.calls.length;
  assert.equal(await stash(who, box, ["c", "t"]), 2);
  assert.deepEqual(F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op) || c.op === "update").map(c => c.op),
    ["createEmbeddedDocuments", "deleteEmbeddedDocuments", "update"]);
});
