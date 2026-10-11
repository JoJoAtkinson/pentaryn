// items-journal-23 [declared]: with Item Piles inactive, Document#getFlag("item-piles", …) throws. The
// directory filter, the lock hooks and the GM backfills read Item Piles' data as plain flags, so they
// no longer throw; with Item Piles active the answers are the same (glue.test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { el } from "./fixtures/dom.mjs";
import { PLAYER, GM, addScene, dropbinWorld, ip, makeActor } from "./fixtures/world.mjs";

const F = await dropbinWorld();
const inactive = function getFlag(scope) {
  if (scope === "item-piles") throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
  return undefined;
};
const chest = makeActor(F, { id: "actorChest000001", name: "Hidden Cache", type: "npc", flags: ip({ enabled: true, type: "container", locked: true }) });
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" });
const scene = addScene(F, { id: "sceneOne00000001", tokens: [{ id: "tokChest00000001", name: "Chest", flags: ip({ enabled: true, type: "container" }), sight: { enabled: false } }] });
for (const d of [chest, ann, scene.tokens.get("tokChest00000001")]) d.getFlag = inactive;

await import("../dropbin.mjs");
F.fire("init");

test("actor directory as a player: no throw, the pile row is still hidden", () => {
  F.become({ userId: PLAYER });
  const root = el("ol", { children: [chest.id, ann.id].map(id => el("li", { dataset: { entryId: id } })) });
  F.fire("renderActorDirectory", {}, root);
  F.become({ userId: GM });
  assert.deepEqual(root.children.map(li => li.dataset.entryId), [ann.id]);
  assert.equal(F.hookErrors.length, 0);
});

test("GM ready: the lock-sound backfill runs without getFlag and the in-view backfill after it still runs", async () => {
  const lines = [];
  const keep = { log: console.log, error: console.error };
  console.log = (...a) => lines.push(String(a[0]));
  console.error = (...a) => lines.push(`error ${a[0]}`);
  F.fire("ready");
  for (let i = 0; i < 50; i++) await Promise.resolve();
  Object.assign(console, keep);
  assert.ok(lines.includes("pentaryn-dropbin | lock sound set on 2 container document(s)"), JSON.stringify(lines));
  assert.ok(!lines.some(l => l.startsWith("error")), JSON.stringify(lines));
});

test("lock hooks as a player: the locked chest is refused without getFlag", () => {
  F.become({ userId: PLAYER });
  const out = Hooks.call("item-piles-preRenderInterface", chest);
  F.become({ userId: GM });
  assert.equal(out, false);
});
