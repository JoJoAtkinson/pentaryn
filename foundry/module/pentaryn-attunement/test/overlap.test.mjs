// Final review ATT-AC-3: stash() and a slot drop each read the owner's away list and slot order, then
// write the whole arrays back after an await. Two overlapping calls on one owner both planned from the
// same read, so the second write dropped the first one's away entry or slot. [declared] Both now run
// through the per-actor chain the bond hand-back uses (actor-adapter `serial`), planning inside the step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attunementWorld, addItem, makeActor, MOD } from "./fixtures/world.mjs";
import { domEvent, installDocument, sheetElement } from "./fixtures/dom.mjs";
import { awayOf } from "../attunement-core.mjs";

const F = await attunementWorld();
installDocument();
await import("../attunement.mjs");
const { stash } = await import("../actor-adapter.mjs");

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test("[declared] ATT-AC-3: two overlapping stash calls on one owner keep both away entries and both slots", async () => {
  const owner = makeActor(F, { id: "actorOvlp0000001", name: "Talo Overlap",
    flags: { [MOD]: { slots: ["itemOvCloak00001", "itemOvRing000001"] } },
    items: [
      { id: "itemOvCloak00001", name: "Cloak", system: { attunement: "required", attuned: true },
        source: { name: "Cloak", system: { attuned: true, attunement: "required" } } },
      { id: "itemOvRing000001", name: "Ring", system: { attunement: "required", attuned: true },
        source: { name: "Ring", system: { attuned: true, attunement: "required" } } },
    ] });
  const box = makeActor(F, { id: "actorOvBox000001", name: "Overlap Box" });

  const counts = await Promise.all([
    stash(owner, box, ["itemOvCloak00001"]),
    stash(owner, box, ["itemOvRing000001"]),
  ]);

  assert.deepEqual(counts, [1, 1]);
  assert.deepEqual(awayOf(owner).map(a => a.name), ["Cloak", "Ring"], "both away entries survive");
  const keys = awayOf(owner).map(a => `away:${a.key}`);
  assert.deepEqual(owner.getFlag(MOD, "slots"), [...keys, null], "each away item keeps the slot it held");
});

test("[declared] ATT-AC-3: two overlapping slot drops on one owner each keep the slot they were dropped on", async () => {
  const actor = makeActor(F, { id: "actorOvDrop00001", name: "Drop Overlap", attunement: { value: 0, max: 3 } });
  actor.isOwner = true;
  const amulet = addItem(F, actor, { id: "itemOvAmulet0001", name: "Amulet", system: { attunement: "required", attuned: false } });
  const wand = addItem(F, actor, { id: "itemOvWand000001", name: "Wand", system: { attunement: "required", attuned: false } });
  // The item write lands a round trip later, as on a server.
  const queue = [];
  actor.updateEmbeddedDocuments = (type, updates) => new Promise(resolve => queue.push(() => {
    for (const { _id, ...changes } of updates) actor.items.get(_id).system.attuned = changes["system.attuned"];
    resolve();
  }));

  const dom = sheetElement();
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  const strip = dom.sidebar.children.find(c => c.classList.contains("pentaryn-attunement"));
  const slots = strip.children.find(c => c.tagName === "UL").children;

  const order = [amulet, wand];
  foundry.applications.ux = { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item", item: order.shift() }) } } };
  globalThis.Item = { implementation: { fromDropData: async data => data.item } };

  const a = strip.listeners.drop[0](domEvent(slots[2]));   // Amulet into the last slot
  const b = strip.listeners.drop[0](domEvent(slots[0]));   // Wand into the first, before Amulet's writes land
  for (let i = 0; i < 10; i++) {
    await flush();
    for (const run of queue.splice(0)) run();
  }
  await Promise.all([a, b]);

  assert.deepEqual(actor.getFlag(MOD, "slots"), ["itemOvWand000001", null, "itemOvAmulet0001"]);
});
