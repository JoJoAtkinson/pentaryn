/**
 * ties-core-U3 [declared] (final review ties-core, 2026-10-12; defect wave 2): several
 * `attributes.link` / `attributes.unlink` calls on one actor, made together (a backstory script's
 * `Promise.all`), all land. Before, each read the actor's link flags before any write had come back,
 * so every call wrote its own list over the same old one and only the last link survived.
 * `linkAttribute` and `unlinkAttribute` now run through the module's `serial()` queue with their flag
 * reads inside it. The actor's update here answers a tick later, as a real server round trip does.
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const NPC = "zzNpc00000000001";
const REGISTRY = [
  { id: "realm", title: "Old Realm", category: "Realm" },
  { id: "city", title: "Vel", category: "City", parent: "realm" },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city" },
  { id: "loner", title: "Loner", category: "Compact" },
  { id: "tide", title: "Tide Order", category: "Order" },
];

await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [{ id: NPC, name: "ZZ Brakka", system: { details: { type: { value: "undead" } }, traits: { size: "lg" } } }],
});
const A = await import("../attributes.mjs");
const npc = game.actors.get(NPC);

// a server round trip: the write lands a tick after it is sent, never synchronously
const apply = npc.update.bind(npc);
npc.update = async (...args) => {
  await new Promise(r => setImmediate(r));
  return apply(...args);
};
const authored = () => [...(npc.getFlag("pentaryn-ties", "attributes") ?? [])].sort();
const off = () => [...(npc.getFlag("pentaryn-ties", "attributesOff") ?? [])].sort();

test("ties-core-U3: three links on one actor made together all land (before: only the last survived)", async () => {
  const out = await Promise.all([A.linkAttribute(npc, "Loner"), A.linkAttribute(npc, "Tide Order"), A.linkAttribute(npc, "Salt Guild")]);
  assert.ok(out.every(r => r.ok), JSON.stringify(out));
  assert.deepEqual(authored(), ["city", "guild", "loner", "realm", "tide"]);
});

test("ties-core-U3: an unlink and a link made together both land", async () => {
  const [gone, added] = await Promise.all([A.unlinkAttribute(npc, "Loner"), A.linkAttribute(npc, "Tide Order")]);
  assert.equal(gone.ok, true);
  assert.deepEqual(gone.removed, ["loner"]);
  assert.equal(added.ok, true);
  assert.deepEqual(authored(), ["city", "guild", "realm", "tide"]);
});

test("ties-core-U3: two unlinks made together — one removes, one suppresses a derived id — both land", async () => {
  const [a, b] = await Promise.all([A.unlinkAttribute(npc, "Tide Order"), A.unlinkAttribute(npc, "type:undead")]);
  assert.deepEqual(a.removed, ["tide"]);
  assert.deepEqual(b.suppressed, ["type:undead"]);
  assert.deepEqual(authored(), ["city", "guild", "realm"]);
  assert.deepEqual(off(), ["type:undead"]);
});

test("ties-core-U3: repairAncestry (a link) queued with a link answers and lands", async () => {
  const [r, l] = await Promise.all([A.repairAncestry(npc, "Salt Guild"), A.linkAttribute(npc, "Loner")]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.added, []);
  assert.deepEqual(l.added, ["loner"]);
  assert.deepEqual(authored(), ["city", "guild", "loner", "realm"]);
});
