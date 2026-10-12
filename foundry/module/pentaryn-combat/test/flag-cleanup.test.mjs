// combat-riders-38 [declared, perf]: the end-of-combat cleanup and the orphan sweep drop an actor's
// stale keys in ONE write ({flags: {scope: {key: _del}}}, v14 unsetFlag's form). Same final flags,
// same count; the riders' turn-flag listener still sees the turn key; a failing write is warned.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, captureConsole, drain, makeActor, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F } = W;
const lines = captureConsole();
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");

const A = makeActor({ id: "flagsA0000000001", name: "A", flags: { [MODULE]: { turn: { key: "c1:1:x" }, reaction: { combatId: "c1" } } } });
const B = makeActor({ id: "flagsB0000000001", name: "B", flags: { [MODULE]: { turn: { key: "nocombat" } } } });
const C = makeActor({ id: "flagsC0000000001", name: "C", flags: { [MODULE]: { reaction: { combatId: "gone" } } } });

test("the orphan sweep at ready: one write per actor, the same final flags; the turn key is visible to updateActor", async () => {
  const seen = [];
  const id = F.Hooks.on("updateActor", (a, changes) => { if (foundry.utils.hasProperty(changes, `flags.${MODULE}.turn`)) seen.push(a.id); });
  F.calls.length = 0;
  F.fire("ready");
  await drain();
  F.Hooks.off("updateActor", id);
  const writes = F.calls.filter(c => c.op === "update" && [A.uuid, B.uuid, C.uuid].includes(c.uuid));
  assert.equal(writes.length, 2, "A once, C once, B untouched");
  assert.deepEqual(A.flags[MODULE], {});
  assert.deepEqual(B.flags[MODULE], { turn: { key: "nocombat" } });
  assert.deepEqual(C.flags[MODULE], {});
  assert.deepEqual(seen, [A.id]);
});

test("a write that fails is warned (end-of-combat cleanup and the orphan sweep)", async () => {
  const D = makeActor({ id: "flagsD0000000001", name: "D", flags: { [MODULE]: { turn: { key: "c7:1:x" } } } });
  const update = D.update;
  D.update = async () => { throw new Error("update refused"); };
  lines.length = 0;
  F.Hooks.callAll("deleteCombat", { id: "c7", combatants: [{ actor: D }] });
  await drain();
  mock.timers.tick(1500);
  await drain();
  D.update = update;
  assert.deepEqual(lines.filter(l => l.level === "warn").map(l => [l.text, l.err]), [
    ["pentaryn-combat | end-of-combat cleanup", "update refused"],
    ["pentaryn-combat | orphan flag sweep", "update refused"],
  ]);
});
