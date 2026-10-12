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
  const log = box.createEmbeddedDocuments;
  box.createEmbeddedDocuments = async (type, data) => (await log(type, data.slice(1))).map((d, i) => ({ ...d, id: `copyA${i}` }));
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
  // [declared] W2-A2: the owner is untouched; the one delete is the rollback of the accepted copy, on the box
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "deleteEmbeddedDocuments" || c.op === "update").map(c => [c.op, c.on ?? c.documentName]),
    [["deleteEmbeddedDocuments", "Box"]]);
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

// [declared] W2-A2 (Joe 2026-10-12; was: the copies are left in the container and named): the copies
// the container did accept are deleted from it again before the rejection, so the item never exists
// twice. The Error still names them, in its message and as `err.created`, and says they were rolled back.
test("W2-A2: a shortfall rolls back the copies the container accepted; the rejection names them", async () => {
  const box = makeActor(F, { id: "actorBoxS0000003", name: "Box Three" });
  let accepted;
  box.createEmbeddedDocuments = async (type, data) => (accepted = data.slice(1).map((d, i) => ({ ...d, id: `copy${i}` })));
  const who = owner("actorSafe0000003");
  const keep = console.error;
  console.error = () => {};
  let err;
  try {
    await stash(who, box, ["c", "t"]).catch(e => { err = e; });
  } finally {
    console.error = keep;
  }
  assert.ok(err instanceof Error);
  assert.equal(accepted.length, 1);
  assert.deepEqual(err.created, ["copy0"]);
  assert.equal(err.rolledBack, true);
  assert.match(err.message, /container accepted 1\/2; originals NOT deleted; copies rolled back from container actorBoxS0000003: copy0$/);
  assert.deepEqual([...who.items.keys()].sort(), ["c", "t"]);
  const rollback = F.calls.filter(c => c.op === "deleteEmbeddedDocuments" && c.on === "Box Three");
  assert.deepEqual(rollback.map(c => [c.type, c.data]), [["Item", ["copy0"]]]);
});

test("W2-A2: a rollback that itself fails: the rejection names the copies left in the container and why", async () => {
  const box = makeActor(F, { id: "actorBoxS0000007", name: "Box Seven" });
  box.createEmbeddedDocuments = async (type, data) => data.slice(1).map((d, i) => ({ ...d, id: `copy${i}` }));
  box.deleteEmbeddedDocuments = async () => { throw new Error("pile refused"); };
  const who = owner("actorSafe0000007");
  const errors = [];
  const keep = console.error;
  console.error = (...a) => errors.push(a);
  let err;
  try {
    await stash(who, box, ["c", "t"]).catch(e => { err = e; });
  } finally {
    console.error = keep;
  }
  assert.deepEqual(err.created, ["copy0"]);
  assert.equal(err.rolledBack, false);
  assert.equal(err.message, "pentaryn-attunement | stash: container accepted 1/2; originals NOT deleted; "
    + "rollback failed (pile refused), copies left in container actorBoxS0000007: copy0");
  assert.equal(errors.length, 2, "the shortfall line and the rollback failure");
  assert.deepEqual([...who.items.keys()].sort(), ["c", "t"]);
});

test("items-journal-10: a container that accepts nothing: err.created is empty, message unchanged", async () => {
  const box = makeActor(F, { id: "actorBoxS0000004", name: "Box Four" });
  box.createEmbeddedDocuments = async () => [];
  const who = owner("actorSafe0000004");
  const keep = console.error;
  console.error = () => {};
  let err;
  try {
    await stash(who, box, ["c", "t"]).catch(e => { err = e; });
  } finally {
    console.error = keep;
  }
  assert.deepEqual(err.created, []);
  assert.equal(err.rolledBack, true, "nothing to roll back");
  assert.equal(err.message, "pentaryn-attunement | stash: container accepted 0/2; originals NOT deleted");
});

// [declared] items-journal-10 remainder (console only): a successful stash leaves one audit line —
// how many copies, which container, the copies' ids and names, and who ran it (playbook §5.1) — so a confiscation run through eval-js
// can be read back from the console. The writes are unchanged (the test above, golden/stash.json).
test("items-journal-10: a successful stash logs one prefixed info line with the count, copy ids, names and by", async () => {
  const box = makeActor(F, { id: "actorBoxS0000005", name: "Box Five" });
  box.createEmbeddedDocuments = async (type, data) => data.map((d, i) => ({ id: `copyS000000000${i}`, name: d.name }));
  const who = owner("actorSafe0000005");
  const infos = [];
  const keep = console.info;
  console.info = (...a) => infos.push(a);
  try {
    assert.equal(await stash(who, box, ["c", "t"]), 2);
  } finally {
    console.info = keep;
  }
  assert.deepEqual(infos, [["pentaryn-attunement | stash: 2 moved to Box Five",
    { owner: "actorSafe0000005", container: "actorBoxS0000005", ids: ["copyS0000000000", "copyS0000000001"],
      names: ["Cloak (Talo)", "Torch (Talo)"], by: F.game.user.id }]]);
  assert.equal(typeof F.game.user.id, "string");
});

test("items-journal-10: a refused stash logs no info line", async () => {
  const box = makeActor(F, { id: "actorBoxS0000006", name: "Box Six" });
  box.createEmbeddedDocuments = async () => [];
  const who = owner("actorSafe0000006");
  const infos = [];
  const keep = { info: console.info, error: console.error };
  console.info = (...a) => infos.push(a);
  console.error = () => {};
  try {
    await assert.rejects(stash(who, box, ["c", "t"]));
  } finally {
    Object.assign(console, keep);
  }
  assert.deepEqual(infos, []);
});
