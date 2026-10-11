// items-journal-21 [declared]: a ledger entry that cannot be recorded is one console warning naming it,
// never an unhandled rejection — the player relay with no GM online, and a GM-side write failure; and the
// corpse revive's Dead toggle (un-awaited in the hp hook) warns instead of rejecting unhandled.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, PLAYER, addScene, dropbinWorld, makeActor } from "./fixtures/world.mjs";

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

test("player relay with no GM online: one warning naming the entry, no unhandled rejection", async () => {
  relay = () => Promise.reject(new Error("No GM connected"));
  F.become({ userId: PLAYER });
  const lines = await warnings(async () => { drop(); await flush(); });
  F.become({ userId: GM });
  assert.deepEqual(lines, [["pentaryn-dropbin | ledger entry not recorded (no GM?)", '{"reason":"drop","item":"Sword","actor":"Ann"}', "Error: No GM connected"]]);
  assert.deepEqual(unhandled, []);
});

test("player relay that throws synchronously is caught the same way", async () => {
  relay = () => { throw new Error("socket closed"); };
  F.become({ userId: PLAYER });
  const lines = await warnings(async () => { drop(); await flush(); });
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
  gob.getActiveTokens = () => [tok];
  const lines = await warnings(async () => {
    Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 3 } } } });
    await flush();
  });
  assert.deepEqual(lines[0], ["pentaryn-dropbin | revive: could not clear Dead on Goblin", "Error: no permission"]);
  assert.deepEqual(unhandled, []);
});
