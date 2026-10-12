/**
 * senses-ac-3 (= perf-4, final review 2026-10-12): setupLight plans first (which torches lack the
 * Light activity, and each one's sort), then writes one batch per parent: world items in one
 * Item.updateDocuments, each actor's or unlinked token actor's torches in one
 * updateEmbeddedDocuments("Item"). It returns the same count. Before: one awaited item.update per
 * torch. The torch-on-create hook keeps its single-item write (test/golden/light-torch-create.json).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, settle, since, captureConsole, TORCH, LANTERN, LIGHT_SPELL, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

const TORCH2 = { id: "itmTorch00000002", name: "Torch", system: { identifier: "torch" }, activities: [{ _id: "actTorchUse00001", type: "utility", sort: 7 }] };
const world = standardWorld({
  heroItems: [TORCH, TORCH2, LANTERN, LIGHT_SPELL],
  worldItems: [
    { id: ID.worldTorch, name: "Torch", system: { identifier: "torch" } },
    { id: "itmWorldTorch002", name: "Torch", system: { identifier: "torch" } },
    { id: "itmWorldTorch003", name: "Torch", system: { identifier: "torch" }, activities: [{ _id: "psLightToggle000", type: "utility" }] },
  ],
});
const F = await boot({ world });
await settle(mock);

const ACT = "system.activities.psLightToggle000";
const writes = calls => calls.filter(c => c.op !== "notify" && c.op !== "ChatMessage.create");

test("senses-ac-3: setupLight writes one batch per parent, not one update per torch; same n; idempotent", async t => {
  const out = captureConsole(t);
  const mark = F.calls.length;
  const n1 = await game.pentaryn.senses.setupLight();
  await settle(mock);
  const calls = writes(since(mark));

  assert.equal(n1, 5, "two hero torches, the goblin token's torch, two world torches");
  assert.deepEqual(calls.filter(c => c.op === "update" && c.documentName === "Item"), [], "no per-item update");
  assert.deepEqual(calls.map(c => [c.op, c.parent ?? null, c.type ?? null, c.updates.map(u => u._id)]), [
    ["updateEmbedded", `Actor.${ID.hero}`, "Item", [ID.torch, TORCH2.id]],
    ["updateEmbedded", `Scene.${ID.s1}.Token.${ID.tGob}.Actor.${ID.goblin}`, "Item", [ID.gobTorch]],
    ["Item.updateDocuments", null, null, [ID.worldTorch, "itmWorldTorch002"]],
  ]);
  const hero = calls[0].updates;
  assert.equal(hero[0][ACT].sort, 0, "a torch with no activities sorts at 0");
  assert.equal(hero[1][ACT].sort, 7 + CONST.SORT_INTEGER_DENSITY, "after its last activity");
  for (const u of calls.flatMap(c => c.updates)) assert.equal(u[ACT].flags[MODULE].lightToggle, true);

  assert.ok(game.items.get("itmWorldTorch002").system.activities.has("psLightToggle000"), "the batch landed");
  assert.deepEqual(out, [["info", `${MODULE} | setupLight: 5 torch item(s) given a Light activity`]]);

  const mark2 = F.calls.length;
  assert.equal(await game.pentaryn.senses.setupLight(), 0);
  assert.deepEqual(writes(since(mark2)), [], "nothing left to write");
});

test("senses-ac-3: a failed batch warns and is not counted; the other parents are still written", async t => {
  const out = captureConsole(t);
  for (const it of [...game.actors.get(ID.hero).items, game.items.get(ID.worldTorch), game.items.get("itmWorldTorch002")]) it.system.activities.delete("psLightToggle000");
  game.actors.get(ID.hero).throwOnUpdate = "actor locked";
  const mark = F.calls.length;
  const n = await game.pentaryn.senses.setupLight();
  game.actors.get(ID.hero).throwOnUpdate = null;
  await settle(mock);
  assert.equal(n, 2, "the two world torches; the hero's batch failed");
  assert.deepEqual(writes(since(mark)).map(c => c.op), ["updateEmbedded", "Item.updateDocuments"]);
  assert.deepEqual(out.map(l => l.slice(0, 2)), [
    ["warn", `${MODULE} | light setup Actor.${ID.hero}`],
    ["info", `${MODULE} | setupLight: 2 torch item(s) given a Light activity`],
  ]);
});
