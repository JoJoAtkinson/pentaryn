// items-journal-30 [declared]: the corpse eye's disc is redrawn only when its size changes (a resize still
// redraws), and the ActiveEffect / hp hooks queue no sync timer on a client that is not the active GM.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, PLAYER, dropbinWorld, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });
const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
await import("../dropbin.mjs");
F.fire("init");
F.fire("ready");
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
await flush();
const { corpses } = game.pentaryn.dropbin;

test("a resized corpse token redraws its disc once; repaints at the same size do not", async () => {
  let size = 100;
  const doc = { name: "Dead Ogre", flags: { [MOD]: { corpse: true } }, isSecret: false, getSize: () => ({ width: size, height: size }) };
  const token = { document: doc, destroyed: false, effects: { zIndex: 1 }, addChild(c) { c.parent = this; return c; } };
  F.piles.add(doc);
  corpses.paintEye(token);
  await flush();
  F.calls.clears = 0;
  for (let i = 0; i < 5; i++) corpses.paintEye(token);
  assert.equal(F.calls.clears, 1);
  size = 200;
  corpses.paintEye(token);
  corpses.paintEye(token);
  assert.equal(F.calls.clears, 2, "one redraw for the new size");
  assert.deepEqual([token.pdLootEye.children[1].width, token.pdLootEye.position.x], [80, 160]);
});

test("not the active GM: effect and hp hooks schedule no timer and never sync", async () => {
  const realSetTimeout = globalThis.setTimeout;
  let timers = 0;
  globalThis.setTimeout = (...a) => { timers++; return realSetTimeout(...a); };
  const gob = makeActor(F, { id: "actorGob00000001", name: "Goblin", type: "npc" });
  let synced = 0;
  gob.getDependentTokens = () => { synced++; return []; };
  try {
    F.become({ userId: PLAYER });
    Hooks.callAll("createActiveEffect", { flags: {}, parent: gob });
    Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 0 } } } });
    mock.timers.tick(200);
    await flush();
  } finally {
    globalThis.setTimeout = realSetTimeout;
    F.become({ userId: GM });
  }
  assert.equal(timers, 0, "no sync timer queued on a player client");
  assert.equal(synced, 0);
});

test("the active GM still queues one debounced sync per actor", async () => {
  const gob = makeActor(F, { id: "actorGob00000002", name: "Goblin", type: "npc" });
  let synced = 0;
  gob.getDependentTokens = () => { synced++; return []; };
  Hooks.callAll("createActiveEffect", { flags: {}, parent: gob });
  Hooks.callAll("deleteActiveEffect", { flags: {}, parent: gob });
  mock.timers.tick(200);
  await flush();
  assert.equal(synced, 1);
});

// dropbin-perf-1 [declared]: refreshToken fires every frame a token animates, and each one asked Item Piles
// isValidItemPile / isItemPileEmpty for every corpse. The answer is cached on the Token (_pdWantsEye) and
// recomputed only on the document-change paths (drawToken, updateToken, updateActor/item hooks, canvasReady).
test("dropbin-perf-1: refreshToken reuses the cached eye answer; updateToken recomputes it", async () => {
  const api = game.itempiles.API;
  const real = api.isValidItemPile;
  let asks = 0;
  api.isValidItemPile = doc => { asks++; return real(doc); };
  try {
    const doc = { name: "Dead Wolf", flags: { [MOD]: { corpse: true } }, isSecret: false, parent: canvas.scene, getSize: () => ({ width: 100, height: 100 }) };
    const token = { document: doc, destroyed: false, effects: { zIndex: 1 }, addChild(c) { c.parent = this; return c; } };
    doc.object = token;
    F.piles.add(doc);
    Hooks.callAll("drawToken", token);
    await flush();
    Hooks.callAll("drawToken", token);
    assert.equal(token._pdWantsEye, true);
    asks = 0;
    for (let i = 0; i < 20; i++) Hooks.callAll("refreshToken", token, { refreshPosition: true });
    assert.equal(asks, 0, "no Item Piles query per refresh");
    assert.equal(token.pdLootEye.visible, true);
    F.piles.delete(doc);                                         // looted: no longer a pile
    Hooks.callAll("updateToken", doc, {});
    assert.equal(asks, 1, "the document change re-asks once");
    assert.equal(token._pdWantsEye, false);
    assert.equal(token.pdLootEye.visible, false);
    Hooks.callAll("refreshToken", token, {});
    assert.equal(asks, 1);
    assert.equal(token.pdLootEye.visible, false, "a refresh keeps it hidden");
    const fresh = { document: { ...doc, object: null }, destroyed: false, effects: { zIndex: 1 }, addChild(c) { c.parent = this; return c; } };
    F.piles.add(fresh.document);
    Hooks.callAll("refreshToken", fresh, {});
    Hooks.callAll("refreshToken", fresh, {});
    assert.equal(asks, 2, "a token refreshed before it was drawn asks once, then caches");
    assert.equal(fresh.pdLootEye.visible, true);
  } finally {
    api.isValidItemPile = real;
  }
});
