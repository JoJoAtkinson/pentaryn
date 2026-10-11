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

// KNOWN: items-journal-10 — the container accepted 1 of 2 copies, and both originals were still
// deleted from the owner: the dropped item is gone with no copy anywhere.
test("KNOWN items-journal-10: a container that drops a copy still gets the owner's originals deleted", async () => {
  const box = makeActor(F, { id: "actorBoxS0000001", name: "Box" });
  box.createEmbeddedDocuments = async (type, data) => data.slice(1);
  const who = owner("actorSafe0000001");
  const from = F.calls.length;
  const out = await stash(who, box, ["c", "t"]);
  assert.equal(out, 2);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "deleteEmbeddedDocuments").map(c => c.data), [["c", "t"]]);
});

test("every copy created: unchanged — delete, then the owner update; resolves the count", async () => {
  const box = makeActor(F, { id: "actorBoxS0000002", name: "Box Two" });
  const who = owner("actorSafe0000002");
  const from = F.calls.length;
  assert.equal(await stash(who, box, ["c", "t"]), 2);
  assert.deepEqual(F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op) || c.op === "update").map(c => c.op),
    ["createEmbeddedDocuments", "deleteEmbeddedDocuments", "update"]);
});
