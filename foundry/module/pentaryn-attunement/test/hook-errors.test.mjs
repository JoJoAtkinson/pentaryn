// [declared] console-only (guide step 4, items-journal-11 hook half): the module's own hook handlers
// are registered through the kit's guard, so a failure carries the module prefix and the handler's
// label instead of Foundry's "Error thrown in hooked function" (sync) or an anonymous
// "Uncaught (in promise)" (async). Return values still reach Foundry: no veto appears.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GM, MOD, addItem, attunementWorld, makeActor } from "./fixtures/world.mjs";

const F = await attunementWorld();
await import("../attunement.mjs");

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
async function errorsOf(fn) {
  const lines = [];
  const keep = console.error;
  console.error = (...a) => lines.push(a);
  try {
    await fn();
  } finally {
    console.error = keep;
  }
  return lines;
}

test("a sync throw in preUpdateItem is logged with the module prefix and label; no veto, not Foundry's catch", async () => {
  const actor = makeActor(F, { id: "actorThrw0000001", name: "Thrower", attunement: { value: 3, max: 3 } });
  const item = addItem(F, actor, { id: "itemThrw00000001", name: "Ring", system: { attunement: "required", attuned: false } });
  actor.getFlag = () => { throw new Error("boom"); };
  const caughtBefore = F.hookErrors.length;
  let out = "unset";
  const lines = await errorsOf(() => { out = F.fireCall("preUpdateItem", item, { system: { attuned: true } }); });
  assert.equal(out, true, "the update goes ahead");
  assert.equal(F.hookErrors.length, caughtBefore, "Foundry's own catch never saw it");
  assert.equal(lines.length, 1);
  assert.equal(lines[0][0], "pentaryn-attunement | preUpdateItem: over-cap warn");
  assert.equal(lines[0][1].message, "boom");
});

test("a sync throw in preCreateItem is logged with its label", async () => {
  const actor = makeActor(F, { id: "actorThrw0000002", name: "Thrower Two" });
  const item = addItem(F, null, { id: "itemThrw00000002", name: "Cloak", flags: { [MOD]: { bond: { actor: actor.id, key: "k" } } } });
  item.parent = actor;
  actor.getFlag = () => { throw new Error("bang"); };
  const lines = await errorsOf(() => F.fireCall("preCreateItem", item, {}, {}));
  assert.deepEqual(lines.map(l => [l[0], l[1].message]), [["pentaryn-attunement | preCreateItem: bond restore", "bang"]]);
});

test("a rejected createItem bond return is logged with its label, not left unhandled", async () => {
  const actor = makeActor(F, { id: "actorRjct0000001", name: "Rejecter", currency: { gp: 1 } });
  const purse = addItem(F, actor, { id: "itemRjct00000001", name: "Coin Purse", type: "loot",
    flags: { [MOD]: { bond: { actor: actor.id, key: "kc", name: "Coin Purse", currency: { gp: 5 } } } } });
  actor.update = async () => { throw new Error("no permission"); };
  const lines = await errorsOf(async () => {
    F.fire("createItem", purse, {}, GM);
    await flush();
  });
  assert.deepEqual(lines.map(l => [l[0], l[1].message]), [["pentaryn-attunement | createItem: bond return", "no permission"]]);
});
