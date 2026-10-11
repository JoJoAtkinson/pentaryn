// Gap fill (coverage): the attunement NaN repair end to end (pack index → preCreateItem), and clear()
// (the confirm dialog, the kept counter, the emptied mirror). Behaviour as it was before the migration.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { dropbinWorld, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });
const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
const index = {
  "dnd5e.equipment24": [{ name: "Cloak of Displacement", system: { attunement: "required" } }, { name: "Rope", system: { attunement: "" } }],
  "dnd5e.items": [{ name: "Cloak of Displacement", system: { attunement: "optional" } }, { name: "Odd", system: { attunement: "NaN" } }],
};
F.game.packs = new Map(Object.entries(index).map(([id, rows]) => [id, { getIndex: async () => rows }]));
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" });
await import("../dropbin.mjs");
F.fire("init");
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const quiet = async fn => {
  const keep = { log: console.log, debug: console.debug };
  console.log = console.debug = () => {};
  try { return await fn(); } finally { Object.assign(console, keep); }
};
await quiet(async () => { F.fire("ready"); await flush(); });

const created = (name, attunement) => {
  const item = { name, _source: { system: { attunement } }, updates: [], updateSource(u) { this.updates.push(u); } };
  Hooks.call("preCreateItem", item, {}, {}, game.user.id);
  return item.updates;
};

test("attunement repair: null / \"NaN\" → the first pack's value by name; unknown → \"\"; valid values untouched", async () => {
  await quiet(() => {
    assert.deepEqual(created("Cloak of Displacement", "NaN"), [{ "system.attunement": "required" }], "2024 pack first");
    assert.deepEqual(created("cloak of displacement", null), [{ "system.attunement": "required" }], "case-insensitive");
    assert.deepEqual(created("Odd", "NaN"), [{ "system.attunement": "" }], "an invalid index value is not learned");
    assert.deepEqual(created("Unheard Of", null), [{ "system.attunement": "" }]);
    assert.deepEqual(created("Rope", "required"), [], "a real value is never touched");
    assert.deepEqual(created("Rope", undefined), []);
  });
});

test("clear(): refused without the confirm; confirmed → log emptied, counter kept, mirror rewritten empty", async () => {
  const item = { name: "Sword", type: "weapon", system: { quantity: 1 }, toObject() { return { name: "Sword", type: "weapon", system: { quantity: 1 } }; } };
  await quiet(async () => {
    Hooks.callAll("item-piles-dropItem", { actor: ann }, "Scene.x.Token.y", [{ item, quantity: 1 }], {});
    await flush();
  });
  F.confirm = false;
  assert.equal(await game.pentaryn.dropbin.clear(), false);
  assert.equal(game.pentaryn.dropbin.all().length, 1);
  F.confirm = true;
  const from = F.calls.length;
  assert.equal(await game.pentaryn.dropbin.clear(), true);
  assert.deepEqual(game.pentaryn.dropbin.all(), []);
  assert.equal(game.settings.get(MOD, "counter"), 1, "numbers are never reused");
  const ups = F.calls.slice(from).filter(c => c.op === "upload");
  assert.deepEqual(ups.map(u => u.bytes), [2], "the mirror is []");
  mock.timers.tick(5000);
  await flush();
  assert.equal(F.calls.slice(from).filter(c => c.op === "upload").length, 1, "the drop's pending mirror was cancelled");
});
