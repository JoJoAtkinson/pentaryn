/**
 * ties-ui-perf-11: expanding one Attribute Review row repaints the panel but no longer walks every
 * world actor for the carrier list. The walk is kept on the open window and dropped when an actor
 * is created, updated or deleted (or its species/background item changes), so a repaint after that
 * shows the new carriers. Closing the window drops it and every hook.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { makeActor } from "./fixtures/world.mjs";

const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": [{ id: "city", title: "Vel", category: "City" }] },
  actors: [
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["city"] } } },
    { id: NPC2, name: "ZZ Second", flags: { "pentaryn-ties": { attributes: [] } } },
  ],
});
const { AttributeReview } = await import("../review-ui.mjs");

/** Count reads of `game.actors.contents` made directly by `carriers()` while `fn` runs. */
async function walks(fn) {
  const coll = game.actors;
  const desc = Object.getOwnPropertyDescriptor(coll, "contents") ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(coll), "contents");
  const read = () => (desc.get ? desc.get.call(coll) : desc.value);
  let n = 0;
  Object.defineProperty(coll, "contents", {
    get() {
      if (/\bcarriers \(/.test(new Error().stack.split("\n")[2] ?? "")) n++;
      return read();
    },
    configurable: true,
  });
  try {
    await fn();
  } finally {
    Object.defineProperty(coll, "contents", desc);
  }
  return n;
}

const carriersOf = html => String(html).match(/<dd>(\d+: [^<]*)<\/dd>/)?.[1] ?? null;

test("ties-ui-perf-11: expanding review rows reuses the carrier walk until an actor changes", async () => {
  const before = F.listeners();
  const rv = new AttributeReview();
  // the window's first paint, then its hooks come up (as _replaceHTML does)
  await rv._renderHTML();
  rv.attachHooks();

  let html = "";
  rv.expanded.add("city");
  const first = await walks(async () => (html = await rv._renderHTML()));
  assert.equal(carriersOf(html), "1: ZZ Brakka");
  rv.expanded.delete("city");
  rv.expanded.add("city");
  const again = await walks(async () => {
    await rv._renderHTML();
    html = await rv._renderHTML();
  });
  assert.equal(first, 1, "the first repaint with hooks up walks the world once");
  assert.equal(again, 0, "expanding and collapsing rows reuses that walk");
  assert.equal(carriersOf(html), "1: ZZ Brakka");

  // updateActor drops the walk: the next repaint shows the new carrier
  await game.actors.get(NPC2).setFlag("pentaryn-ties", "attributes", ["city"]);
  assert.equal(await walks(async () => (html = await rv._renderHTML())), 1);
  assert.equal(carriersOf(html), "2: ZZ Brakka, ZZ Second");

  // createActor
  const made = makeActor(F, { id: "zzNpc00000000003", name: "ZZ Third", flags: { "pentaryn-ties": { attributes: ["city"] } } });
  made.collection = game.actors;
  game.actors.set(made.id, made);
  F.fire("createActor", made, {}, game.user.id);
  assert.equal(await walks(async () => (html = await rv._renderHTML())), 1);
  assert.equal(carriersOf(html), "3: ZZ Brakka, ZZ Second, ZZ Third");

  // deleteActor
  await made.delete();
  assert.equal(await walks(async () => (html = await rv._renderHTML())), 1);
  assert.equal(carriersOf(html), "2: ZZ Brakka, ZZ Second");

  // a species item on an actor moves its derived ids; an unrelated item does not drop the walk
  F.fire("updateItem", { type: "weapon", parent: game.actors.get(NPC) }, {});
  assert.equal(await walks(() => rv._renderHTML()), 0);
  F.fire("createItem", { type: "race", parent: game.actors.get(NPC) }, {});
  assert.equal(await walks(() => rv._renderHTML()), 1);

  await rv._onClose({});
  assert.equal(rv.carrierMap, null, "close drops the walk");
  assert.deepEqual(F.listeners(), before, "every hook removed on close");
});
