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
  gob.getActiveTokens = () => { synced++; return []; };
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
  gob.getActiveTokens = () => { synced++; return []; };
  Hooks.callAll("createActiveEffect", { flags: {}, parent: gob });
  Hooks.callAll("deleteActiveEffect", { flags: {}, parent: gob });
  mock.timers.tick(200);
  await flush();
  assert.equal(synced, 1);
});
