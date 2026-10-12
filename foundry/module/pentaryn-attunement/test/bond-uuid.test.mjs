// ATT-ROB-2 (final review 2026-10-12): bonds were keyed on actor.id, and every unlinked token shares its base
// actor's id, so an item stashed from token A came home "attuned and equipped" on token B or the base
// actor, and lost its bond there. [declared] Bonds are now keyed on the actor's uuid; a legacy bond holding
// the bare id is still read as before.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, MOD, addItem, attunementWorld, makeActor } from "./fixtures/world.mjs";
import { awayOf, bondChanges, isBondOwner } from "../attunement-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });   // the hand-back's 750 ms claim (ATT-AC-1-residual)

const F = await attunementWorld();
await import("../attunement.mjs");
const { stash } = await import("../actor-adapter.mjs");

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const since = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op);

/** An unlinked token's synthetic actor: same id as the base, its own uuid under the token. */
function tokenActor(id, tokenId, opts = {}) {
  const actor = makeActor(F, { id, name: "Bandit", ...opts });
  actor.parent = { uuid: `Scene.sceneBond0000001.Token.${tokenId}` };
  return actor;
}

const BASE_ID = "actorBand0000001";
const tokA = tokenActor(BASE_ID, "tokenBondA000001", {
  flags: { [MOD]: { slots: ["itemCloak0000009"] } },
  items: [{ id: "itemCloak0000009", name: "Cloak", system: { attuned: true },
    source: { name: "Cloak", system: { attuned: true, equipped: true, attunement: "required" } } }],
});
const tokB = tokenActor(BASE_ID, "tokenBondB000001");
const base = makeActor(F, { id: BASE_ID, name: "Bandit" });
const box = makeActor(F, { id: "actorBoxB0000001", name: "Box" });

const from = since(0).length;
await stash(tokA, box, ["itemCloak0000009"]);
const [cloak] = since(from, "createEmbeddedDocuments")[0].data;
const bond = cloak.flags[MOD].bond;

test("ATT-ROB-2: stash keys the bond on the owner's uuid, not the id its unlinked siblings share", () => {
  assert.equal(bond.actor, tokA.uuid);
  assert.notEqual(tokA.uuid, tokB.uuid);
  assert.equal(tokA.id, tokB.id);
});

for (const [label, other, n] of [["token B", tokB, "B"], ["the base actor", base, "C"]]) {
  test(`ATT-ROB-2: token A's cloak created on ${label}: only the tag goes; not attuned, not equipped, bond kept`, async () => {
    const item = addItem(F, null, { id: `itemAway${n}0000001`, name: cloak.name, flags: { [MOD]: { bond } } });
    item.parent = other;
    let mark = since(0).length;
    F.fireCall("preCreateItem", item, {}, {});
    assert.deepEqual(since(mark, "updateSource").map(c => c.changes), [{ name: "Cloak" }]);

    const held = addItem(F, other, { id: `itemHeld${n}0000001`, name: "Cloak", flags: { [MOD]: { bond } } });
    mark = since(0).length;
    F.fire("createItem", held, {}, GM);
    await flush();
    assert.deepEqual(since(mark).filter(c => ["update", "notify"].includes(c.op)), [], "no bond clear, no hand-back, no toast");
  });
}

test("ATT-ROB-2: token A's cloak created on token A comes home attuned and equipped in its slot", async () => {
  const item = addItem(F, null, { id: "itemHomeA0000001", name: cloak.name, flags: { [MOD]: { bond } } });
  item.parent = tokA;
  let mark = since(0).length;
  F.fireCall("preCreateItem", item, {}, {});
  assert.deepEqual(since(mark, "updateSource").map(c => c.changes), [
    { name: "Cloak", "system.attunement": "required", "system.attuned": true, "system.equipped": true },
  ]);

  const held = addItem(F, tokA, { id: "itemHomeA0000002", name: "Cloak", system: { attuned: true }, flags: { [MOD]: { bond } } });
  mark = since(0).length;
  F.fire("createItem", held, {}, GM);
  await flush();
  mock.timers.tick(750);                      // [declared] ATT-AC-1-residual: the hand-back is claimed first
  await flush();
  assert.deepEqual(since(mark, "update").map(c => c.documentName), ["Item", "Item", "Actor"]);
  assert.deepEqual(awayOf(tokA), []);
});

test("ATT-ROB-2: a legacy bond holding the bare id is still read as before", () => {
  const legacy = { actor: BASE_ID, key: "k", name: "Cloak", attunement: "required", equipped: true };
  assert.equal(isBondOwner(legacy, base), true);
  assert.equal(isBondOwner(legacy, tokA), true, "the id form cannot tell the tokens apart: unchanged");
  assert.equal(isBondOwner({ ...legacy, actor: tokA.uuid }, tokA), true);
  assert.equal(isBondOwner({ ...legacy, actor: tokA.uuid }, base), false);
  assert.equal(isBondOwner({ ...legacy, actor: undefined }, base), false);
  assert.equal(isBondOwner(legacy, null), false);
  assert.equal(JSON.stringify(bondChanges(legacy, { actorId: BASE_ID, actorUuid: base.uuid, awayKeys: ["k"] })),
    JSON.stringify({ name: "Cloak", "system.attunement": "required", "system.attuned": true, "system.equipped": true }));
  assert.deepEqual(bondChanges({ ...legacy, actor: tokA.uuid }, { actorId: BASE_ID, actorUuid: base.uuid, awayKeys: ["k"] }), { name: "Cloak" });
});
