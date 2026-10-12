// Final review ATT-AC-1: README "arrives attuned and equipped in its own slot". An Item Piles take-all of a
// stash() box creates several bonded items in one batch; each createItem hand-back must see the previous
// one's actor write, or one away entry survives next to its own, attuned item. Document writes are
// deferred here until drained, which models the server round trip the stub otherwise skips.
import { registerHooks } from "node:module";
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
  mock.timers.tick(750);                        // [declared] ATT-AC-1-residual: each hand-back is claimed first
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

// ATT-AC-1-residual: README "Two sessions / who writes". The MCP bridge tab and a GM browser tab both pass
// createItem's userId gate, and each keeps its own hand-back chain (a second module instance here, and its
// own actor-adapter instance, so its `tails` is its own: the chain moved there with ATT-AC-3). [declared] Each returning item is claimed (kit claimDocument, key `home`) so exactly
// one tab clears the bond and hands the slot back: one actor write and one toast per item, no phantom away slot.
test("[declared] ATT-AC-1-residual: two GM tabs, two bonded items home in one batch — one hand-back per item", async () => {
  const handlers = {};
  // The second tab's bonds.mjs gets its own actor-adapter (and with it its own `tails`).
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const r = next(specifier, context);
      return (specifier === "./actor-adapter.mjs" && context.parentURL?.endsWith("?tab=browser")) ? { ...r, url: r.url + "?tab=browser" } : r;
    },
  });
  const tabB = await import("../bonds.mjs?tab=browser").finally(() => hooks.deregister());
  tabB.install({ on: (name, fn) => { handlers[name] = fn; } });

  const actor = makeActor(F, { id: "actorTwoTab00001", name: "Talo Twotab",
    flags: { [MOD]: { away: [{ key: "t1", name: "Staff", img: "i" }, { key: "t2", name: "Ring", img: "i" }], slots: ["away:t1", "away:t2"] } } });
  const bond = (key, name) => ({ actor: actor.uuid, key, name, equipped: true, attuned: true, attunement: "required" });
  const staff = addItem(F, actor, { id: "itemStaffTwoTab1", name: "Staff", system: { attuned: true }, flags: { [MOD]: { bond: bond("t1", "Staff") } } });
  const ring = addItem(F, actor, { id: "itemRingTwoTab01", name: "Ring", system: { attuned: true }, flags: { [MOD]: { bond: bond("t2", "Ring") } } });
  const queue = [];
  for (const doc of [actor, staff, ring]) deferWrites(doc, queue);
  const from = F.calls.length;

  try {
    F.become({ socketId: "socket-bridge" });
    F.fire("createItem", staff, {}, GM);
    F.fire("createItem", ring, {}, GM);
    F.become({ socketId: "socket-browser" });
    handlers.createItem(staff, {}, GM);
    handlers.createItem(ring, {}, GM);
    for (let i = 0; i < 3; i++) {
      await drain(queue);
      mock.timers.tick(750);
    }
    await drain(queue);
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }

  assert.deepEqual(awayOf(actor), [], "no phantom away slot");
  assert.deepEqual(actor.getFlag(MOD, "slots"), ["itemStaffTwoTab1", "itemRingTwoTab01"]);
  assert.equal(F.calls.slice(from).filter(c => c.op === "update" && c.documentName === "Actor").length, 2, "one hand-back write per item");
  assert.equal(F.calls.slice(from).filter(c => c.op === "notify").length, 2, "one toast per item");
  assert.equal(staff.getFlag(MOD, "bond"), undefined);
  assert.equal(staff.flags[MOD].claims?.home, undefined, "the winner clears its claim with the bond");
});

test("[declared] ATT-AC-1-residual: preCreateItem clears a stale claims.home copied with the item", () => {
  // An item copied inside another tab's 750 ms hand-back window carries that tab's stamp; left in place,
  // every tab reads the claim as held, nobody hands the slot back and the bond never clears.
  const actor = makeActor(F, { id: "actorStaleHome01", name: "Stale Home", flags: { [MOD]: { away: [{ key: "sh", name: "Staff", img: "i" }] } } });
  const bond = { actor: actor.uuid, key: "sh", name: "Staff", equipped: true, attuned: true, attunement: "required" };
  const item = addItem(F, null, { id: "itemStaleHome001", name: "Staff (Stale)", flags: { [MOD]: { bond, claims: { home: "socket-gone" } } } });
  item.parent = actor;
  const from = F.calls.length;
  F.fireCall("preCreateItem", item, {}, {});
  assert.equal(F.calls.slice(from).filter(c => c.op === "updateSource").at(-1)?.changes["flags.pentaryn-attunement.claims.home"], "<_del>");
});
