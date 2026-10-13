// DB-AC-1 live (FIX-3) [declared]: a drop onto the canvas is ONE ledger row. Item Piles' _dropItems takes
// the item off the character on the active GM's client (_removeItems → deleteEmbeddedDocuments, no
// options), so the sheet-delete capture records a 'delete' row first; the drop hook then follows with
// the same item. The drop row takes the delete row's place (its number), so a whole-stack drop is one
// 'drop' row with the pile's scene. A delete with another item id, or one older than DEDUPE_MS, stays.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, addScene, dropbinWorld, makeActor } from "./fixtures/world.mjs";
import * as core from "../dropbin-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 13, 12) });

const F = await dropbinWorld();
// `_id` as well as `id`: the kit stub's toObject() is the doc as JSON, and a Foundry source has `_id`.
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" }, {
  items: [
    { id: "itemRope00000001", _id: "itemRope00000001", name: "Rope", type: "loot", system: { quantity: 1 } },
    { id: "itemLamp00000001", _id: "itemLamp00000001", name: "Lamp", type: "loot", system: { quantity: 1 } },
    { id: "itemTorch0000001", _id: "itemTorch0000001", name: "Torch", type: "loot", system: { quantity: 1 } },
  ],
});
const crypt = addScene(F, { id: "sceneCrypt000001", name: "Crypt" });
const vault = addScene(F, { id: "sceneVault000001", name: "Vault", tokens: [{ id: "tokPile000000001", name: "Pile" }] });
const pile = vault.tokens.get("tokPile000000001");
canvas.scene = crypt;

await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
F.fire("ready");

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const settle = async () => {
  for (let i = 0; i < 20; i++) { mock.timers.tick(0); await flush(); }
};
const quiet = async fn => {
  const keep = { log: console.log, debug: console.debug };
  console.log = console.debug = () => {};
  try { return await fn(); } finally { Object.assign(console, keep); }
};
const rows = () => game.pentaryn.dropbin.all().map(e => [e.n, e.reason, e.itemName, e.sceneName, e.pileUuid]);

/** What Item Piles does on the GM's client: remove the item, create the pile, then fire the hook. */
async function itemPilesDrop(id) {
  const src = ann.items.get(id).toObject();
  await ann.items.get(id).delete();
  await settle();
  Hooks.callAll("item-piles-dropItem", { actor: ann }, { tokenUuid: pile.uuid, actorUuid: "Actor.defaultPile00001" },
    [{ ...src, system: { quantity: 1 } }], { x: 300, y: 400 });
  await settle();
}

test("DB-AC-1 live: an Item Piles drop off the sheet is one 'drop' row on the pile's scene, not a delete and a drop", async () => {
  await quiet(() => itemPilesDrop("itemRope00000001"));
  assert.deepEqual(rows(), [[1, "drop", "Rope", "Vault", pile.uuid]]);
  await quiet(() => itemPilesDrop("itemLamp00000001"));
  assert.deepEqual(rows(), [[1, "drop", "Rope", "Vault", pile.uuid], [2, "drop", "Lamp", "Vault", pile.uuid]]);
  assert.equal(game.settings.get("pentaryn-dropbin", "counter"), 2);
});

test("DB-AC-1 live: a hand delete followed by a drop of another item keeps both rows", async () => {
  await quiet(async () => {
    await ann.items.get("itemTorch0000001").delete();
    await settle();
    Hooks.callAll("item-piles-dropItem", { actor: ann }, pile.uuid,
      [{ _id: "itemOther0000001", name: "Torch", type: "loot", system: { quantity: 1 } }], { x: 1, y: 1 });
    await settle();
  });
  assert.deepEqual(rows().slice(-2), [[3, "delete", "Torch", "Crypt", null], [4, "drop", "Torch", "Vault", pile.uuid]]);
});

test("appendEntry: a drop of the item the tail 'delete' row removed takes that row's place", () => {
  const del = { t: 0, reason: "delete", itemName: "Rope", fromActorId: "a", quantity: 1, sceneName: "Crypt", item: { _id: "i1" } };
  const drop = { t: 900, reason: "drop", itemName: "Rope", fromActorId: "a", quantity: 1, sceneName: "Vault", item: { _id: "i1" } };
  const one = core.appendEntry([], 6, del);
  const r = core.appendEntry(one.log, one.counter, drop);
  assert.deepEqual([r.n, r.counter, r.duplicate, r.log.length], [7, 7, false, 1]);
  assert.deepEqual(r.log[0], { n: 7, ...drop });
  assert.equal(one.log[0].reason, "delete", "never mutates its input");
  assert.equal(core.appendEntry(r.log, r.counter, drop).duplicate, true, "the same drop seen on a second GM tab: one row");
  assert.equal(core.appendEntry(one.log, 7, { ...drop, item: { _id: "i2" } }).log.length, 2, "another item: its own row");
  assert.equal(core.appendEntry(one.log, 7, { ...drop, fromActorId: "b" }).log.length, 2, "another actor: its own row");
  assert.equal(core.appendEntry(one.log, 7, { ...drop, t: 2000 }).log.length, 2, "DEDUPE_MS later: its own row");
  assert.equal(core.appendEntry(one.log, 7, { ...drop, item: null }).log.length, 2, "no item source: its own row");
  assert.equal(core.appendEntry(one.log, 7, { ...del, t: 100, item: { _id: "i3" } }).log.length, 2, "a delete never merges");
});

// Wave 3 dropbin item 1 [declared]: a drop onto an EXISTING pile goes through Item Piles' _transferItems,
// which fires `item-piles-preTransferItems` (on the client running it, the active GM's) with the
// character's removed items, deletes the item off the character (our 'delete' row), then creates it on
// the pile under a NEW id (ensureValidIds) and fires the drop hook with that new item. The drop is still
// one row: the moved item is matched within that transfer by id, else by name, type and quantity.
const bag = addScene(F, { id: "sceneBag00000001", name: "Bag", tokens: [{ id: "tokBag0000000001", name: "Old pile" }] });
const oldPile = bag.tokens.get("tokBag0000000001");
const pileActor = { documentName: "Actor", id: "actorPile0000001", name: "Old pile" };
const bob = makeActor(F, { id: "actorBob00000001", name: "Bob" }, {
  items: [
    { id: "itemCoil00000001", _id: "itemCoil00000001", name: "Coil", type: "loot", system: { quantity: 2 } },
    { id: "itemFlask0000001", _id: "itemFlask0000001", name: "Flask", type: "loot", system: { quantity: 1 } },
    { id: "itemFlask0000002", _id: "itemFlask0000002", name: "Flask", type: "loot", system: { quantity: 1 } },
  ],
});

/** Item Piles' _dropItems onto an existing pile: preTransferItems, the delete, the new-id item, the drop hook. */
async function dropOnPile(actor, id, newId) {
  const src = actor.items.get(id).toObject();
  const qty = src.system.quantity;
  Hooks.call("item-piles-preTransferItems", actor, { itemDeltas: [{ item: src, quantity: -qty }], itemsToDelete: [id] },
    pileActor, { itemsToCreate: [{ ...src, _id: newId }] }, false);
  await actor.items.get(id).delete();
  await settle();
  Hooks.callAll("item-piles-dropItem", { actor }, oldPile.uuid, [{ item: { ...src, _id: newId }, quantity: qty }], { x: 5, y: 6 });
  await settle();
}

test("wave-3 item 1: a drop onto an existing pile (new id on the pile) is one 'drop' row on the pile's scene", async () => {
  const before = game.pentaryn.dropbin.all().length;
  await quiet(() => dropOnPile(bob, "itemCoil00000001", "pileItemNew00001"));
  const added = game.pentaryn.dropbin.all().slice(before);
  assert.deepEqual(added.map(e => [e.reason, e.itemName, e.quantity, e.sceneName, e.pileUuid]), [["drop", "Coil", 2, "Bag", oldPile.uuid]]);
  assert.equal(game.settings.get("pentaryn-dropbin", "counter"), added[0].n, "the drop took the delete row's number");
});

test("wave-3 item 1: a hand delete, then a drop onto a pile of another same-named item, keeps both rows", async () => {
  const before = game.pentaryn.dropbin.all().length;
  await quiet(async () => {
    await bob.items.get("itemFlask0000001").delete();          // by hand, off the sheet
    await settle();
    // the second Flask leaves by a partial transfer: nothing deleted off the sheet, so no delete row of its own
    const src = bob.items.get("itemFlask0000002").toObject();
    Hooks.call("item-piles-preTransferItems", bob, { itemDeltas: [{ item: src, quantity: -1 }], itemsToDelete: [] },
      pileActor, { itemsToCreate: [] }, false);
    Hooks.callAll("item-piles-dropItem", { actor: bob }, oldPile.uuid, [{ item: { ...src, _id: "pileItemNew00002" }, quantity: 1 }], { x: 1, y: 1 });
    await settle();
  });
  const added = game.pentaryn.dropbin.all().slice(before);
  assert.deepEqual(added.map(e => [e.reason, e.itemName]), [["delete", "Flask"], ["drop", "Flask"]]);
});

test("wave-3 item 1 movedSourceId: the transfer's item by id, else by name, type and quantity; else null", () => {
  const moved = [{ _id: "a1", name: "Rope", type: "loot", quantity: 1 }, { _id: "a2", name: "Coil", type: "loot", quantity: 2 }];
  const transfer = { actorId: "ann", t: 1000, moved };
  const at = (item, quantity, extra = {}) => core.movedSourceId(transfer, { actorId: "ann", item, quantity, now: 1500, ...extra });
  assert.equal(at({ _id: "a2", name: "Coil", type: "loot" }, 2), "a2", "same id");
  assert.equal(at({ _id: "new", name: "Coil", type: "loot" }, 2), "a2", "new id: name, type and quantity");
  assert.equal(at({ _id: "new", name: "Coil", type: "loot" }, 1), null, "another quantity");
  assert.equal(at({ _id: "new", name: "Coil", type: "tool" }, 2), null, "another type");
  assert.equal(at({ _id: "new", name: "Coil", type: "loot" }, 2, { actorId: "bob" }), null, "another actor's transfer");
  assert.equal(at({ _id: "new", name: "Coil", type: "loot" }, 2, { now: 1000 + core.DEDUPE_MS }), null, "a stale transfer");
  assert.equal(core.movedSourceId(null, { actorId: "ann", item: { _id: "a1" }, quantity: 1, now: 1 }), null, "no transfer");
});
