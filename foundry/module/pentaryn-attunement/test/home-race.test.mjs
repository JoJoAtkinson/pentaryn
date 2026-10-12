// Final review ATT-AC-1: README "arrives attuned and equipped in its own slot". An Item Piles take-all of a
// stash() box creates several bonded items in one batch; each createItem hand-back must see the previous
// one's actor write, or one away entry survives next to its own, attuned item. Document writes are
// deferred here until drained, which models the server round trip the stub otherwise skips.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, MOD, addItem, attunementWorld, makeActor } from "./fixtures/world.mjs";
import { awayOf } from "../attunement-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });   // the coin purse's 750 ms claim (ATT-AC-2)

const F = await attunementWorld();
await import("../attunement.mjs");

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** Hold every write to `doc` until `drain` runs it, as a server round trip would. */
function deferWrites(doc, queue) {
  const apply = doc.update;
  doc.update = (changes, options) => new Promise((resolve, reject) => {
    queue.push(() => apply.call(doc, changes, options).then(resolve, reject));
  });
}
async function drain(queue) {
  for (let i = 0; i < 20; i++) {
    await flush();
    if (!queue.length) continue;
    for (const run of queue.splice(0)) run();
  }
  await flush();
}

test("two bonded items home in one batch: both away entries consumed, each in its own slot", async () => {
  const actor = makeActor(F, { id: "actorRace0000001", name: "Talo Race",
    flags: { [MOD]: { away: [{ key: "k1", name: "Staff", img: "i" }, { key: "k2", name: "Ring", img: "i" }], slots: ["away:k1", "away:k2"] } } });
  const bond = (key, name) => ({ actor: actor.id, key, name, equipped: true, attuned: true, attunement: "required" });
  const staff = addItem(F, actor, { id: "itemStaff0000002", name: "Staff", system: { attuned: true }, flags: { [MOD]: { bond: bond("k1", "Staff") } } });
  const ring = addItem(F, actor, { id: "itemRing00000002", name: "Ring", system: { attuned: true }, flags: { [MOD]: { bond: bond("k2", "Ring") } } });
  const queue = [];
  for (const doc of [actor, staff, ring]) deferWrites(doc, queue);

  F.fire("createItem", staff, {}, GM);
  F.fire("createItem", ring, {}, GM);
  await drain(queue);

  assert.deepEqual(awayOf(actor), []);
  assert.deepEqual(actor.getFlag(MOD, "slots"), ["itemStaff0000002", "itemRing00000002"]);
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => c.message), [
    "Staff is back with Talo Race — attunement restored.",
    "Ring is back with Talo Race — attunement restored.",
  ]);
});

// ATT-AC-2: README "A bonded `Coin Purse` pays its coin to whoever takes it". Two purses taken in one batch
// both win their own claim and settle together; each must add to the other's total, not to the same read.
test("ATT-AC-2: two coin purses in one batch: both pay", async () => {
  const actor = makeActor(F, { id: "actorPurseRace01", name: "Purse Race", currency: { gp: 10 } });
  const bond = (key, gp) => ({ actor: actor.id, key, name: "Coin Purse", currency: { gp } });
  const a = addItem(F, actor, { id: "itemPurseRaceA01", name: "Coin Purse", type: "loot", flags: { [MOD]: { bond: bond("ka", 5) } } });
  const b = addItem(F, actor, { id: "itemPurseRaceB01", name: "Coin Purse", type: "loot", flags: { [MOD]: { bond: bond("kb", 3) } } });
  const queue = [];
  deferWrites(actor, queue);
  const from = F.calls.length;

  F.fire("createItem", a, {}, GM);
  F.fire("createItem", b, {}, GM);
  await flush();
  mock.timers.tick(750);
  await flush();
  await drain(queue);

  assert.equal(actor.system.currency.gp, 18);
  assert.equal(F.calls.slice(from).filter(c => c.op === "delete" && c.documentName === "Item").length, 2);
});
