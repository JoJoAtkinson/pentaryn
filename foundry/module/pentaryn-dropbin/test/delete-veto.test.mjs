// kit-edge-2: the kit stub's doc.delete() now runs the vetoable preDeleteItem hook first, as Foundry does,
// so the sheet-delete capture (ledger.mjs, reg.on("preDeleteItem")) is driven through a real
// item.delete(). Dropbin's listener never vetoes; a listener that runs before it and vetoes leaves the
// item on the sheet and nothing on the ledger.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, dropbinWorld, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" }, {
  items: [
    { id: "itemSword0000001", name: "Sword", type: "weapon", system: { quantity: 1 } },
    { id: "itemShield000001", name: "Shield", type: "equipment", system: { quantity: 1 } },
  ],
});

// registered before ready, so it runs ahead of dropbin's capture (added at ready)
let veto = false;
Hooks.on("preDeleteItem", () => (veto ? false : undefined));

await import("../dropbin.mjs");
F.fire("init");
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
const ledger = () => game.settings.get(MOD, "log");

test("kit-edge-2: an earlier preDeleteItem veto keeps the item and writes no ledger entry", async () => {
  await settle();
  const before = ledger().length;
  const from = F.calls.length;
  veto = true;
  const out = await quiet(async () => {
    const r = await ann.items.get("itemSword0000001").delete();
    await settle();
    return r;
  });
  veto = false;
  assert.equal(out, undefined, "the vetoed delete resolves undefined");
  assert.ok(ann.items.get("itemSword0000001"), "the sword is still on Ann's sheet");
  assert.equal(ledger().length, before);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "delete"), []);
});

test("kit-edge-2: dropbin's capture never vetoes — item.delete() removes the item and the ledger records it", async () => {
  const before = ledger().length;
  const shield = ann.items.get("itemShield000001");
  const out = await quiet(async () => {
    const r = await shield.delete();
    await settle();
    return r;
  });
  assert.equal(out, shield);
  assert.equal(ann.items.get("itemShield000001"), undefined);
  const log = ledger();
  assert.equal(log.length, before + 1);
  assert.equal(log.at(-1).reason, "delete");
  assert.equal(log.at(-1).itemName, "Shield");
  assert.equal(game.user.id, GM);
});
