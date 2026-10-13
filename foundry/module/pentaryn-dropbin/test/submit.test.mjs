// items-journal-21 [declared]: a ledger entry that cannot be recorded is one console warning naming it,
// never an unhandled rejection — the player relay with no GM online, and a GM-side write failure; and the
// corpse revive's Dead toggle (un-awaited in the hp hook) warns instead of rejecting unhandled.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, PLAYER, addScene, dropbinWorld, makeActor } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
let relay = () => 99;
globalThis.socketlib = { registerModule: () => ({ register() {}, executeAsGM: (...a) => relay(...a) }) };
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" },
  { items: [{ id: "itemSword0000001", name: "Sword", type: "weapon", system: { quantity: 1 } }] });
await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
F.fire("ready");

const unhandled = [];
process.on("unhandledRejection", err => unhandled.push(err));
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise(r => setImmediate(r));
};
async function warnings(fn) {
  const lines = [];
  const keep = { warn: console.warn, log: console.log };
  console.warn = (...a) => lines.push(a.map(x => (x instanceof Error ? `Error: ${x.message}` : typeof x === "string" ? x : JSON.stringify(x))));
  console.log = () => {};
  try {
    await fn();
  } finally {
    Object.assign(console, keep);
  }
  return lines;
}
const drop = () => Hooks.callAll("item-piles-dropItem", { actor: ann }, "Scene.x.Token.y", [{ item: ann.items.get("itemSword0000001"), quantity: -1 }], {});
// DB-AC-1 [declared]: a player's client records no drop (the active GM's does); its relay is a delete
const lose = () => Hooks.call("preDeleteItem", ann.items.get("itemSword0000001"), {}, PLAYER);

test("player relay with no GM online: one warning naming the entry, no unhandled rejection", async () => {
  relay = () => Promise.reject(new Error("No GM connected"));
  F.become({ userId: PLAYER });
  const lines = await warnings(async () => { lose(); await flush(); });
  F.become({ userId: GM });
  assert.deepEqual(lines, [["pentaryn-dropbin | ledger entry not recorded (no GM?)", '{"reason":"delete","item":"Sword","actor":"Ann"}', "Error: No GM connected"]]);
  assert.deepEqual(unhandled, []);
});

test("player relay that throws synchronously is caught the same way", async () => {
  relay = () => { throw new Error("socket closed"); };
  F.become({ userId: PLAYER });
  const lines = await warnings(async () => { lose(); await flush(); });
  F.become({ userId: GM });
  assert.equal(lines.length, 1);
  assert.equal(lines[0][2], "Error: socket closed");
});

test("GM write failure: one warning, no unhandled rejection", async () => {
  const realSet = game.settings.set;
  game.settings.set = async () => { throw new Error("db locked"); };
  const lines = await warnings(async () => { drop(); await flush(); });
  game.settings.set = realSet;
  assert.deepEqual(lines, [["pentaryn-dropbin | ledger entry not recorded", '{"reason":"drop","item":"Sword","actor":"Ann"}', "Error: db locked"]]);
  assert.deepEqual(unhandled, []);
});

test("the hp hook's Dead toggle on a revived corpse warns on failure instead of rejecting unhandled", async () => {
  const gob = makeActor(F, { id: "actorGob00000001", name: "Goblin", type: "npc" });
  const scene = addScene(F, { id: "sceneOne00000001", tokens: [{ id: "tokGob0000000001", name: "Goblin", actorId: gob.id, flags: { [MOD]: { corpse: true } } }] });
  const tok = scene.tokens.get("tokGob0000000001");
  Object.assign(gob, { statuses: new Set(["dead"]), toggleStatusEffect: async () => { throw new Error("no permission"); } });
  gob.getDependentTokens = () => [tok];
  const lines = await warnings(async () => {
    Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 3 } } } });
    await flush();
  });
  assert.deepEqual(lines[0], ["pentaryn-dropbin | revive: could not clear Dead on Goblin", "Error: no permission"]);
  assert.deepEqual(unhandled, []);
});

// dropbin-R7 [declared]: the HUD Revive button's rejection was unhandled and unprefixed (the HUD
// stayed open, nothing on screen). Now: one prefixed console warning, one warn toast, HUD left open.
test("dropbin-R7: a failed HUD Revive warns once with the module prefix and one toast, never unhandled", async () => {
  const gob = makeActor(F, { id: "actorGob00000002", name: "Goblin", type: "npc" });
  const scene = addScene(F, { id: "sceneTwo00000001", tokens: [{ id: "tokGob0000000002", name: "Goblin Corpse", actorId: gob.id, flags: { [MOD]: { corpse: true } } }] });
  const tok = scene.tokens.get("tokGob0000000002");
  Object.assign(gob, { statuses: new Set(["dead"]), toggleStatusEffect: async () => { throw new Error("no permission"); } });
  const right = el("div", { className: "col right" });
  let closed = 0;
  F.fire("renderTokenHUD", { object: { document: tok }, close() { closed++; } }, el("div", { children: [right] }));
  const from = F.calls.length;
  const lines = await warnings(async () => {
    right.querySelector(".pd-corpse-revive").click();
    await flush();
  });
  assert.deepEqual(lines, [["pentaryn-dropbin | revive failed for Goblin Corpse", "Error: no permission"]]);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "notify").map(c => [c.level, c.message]),
    [["warn", "Could not revive Goblin Corpse. See the console."]]);
  assert.equal(closed, 0, "the HUD stays open on a failure");
  assert.deepEqual(unhandled, []);
});
