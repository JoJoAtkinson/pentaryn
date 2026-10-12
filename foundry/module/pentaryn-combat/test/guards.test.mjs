// Guide S11 [declared D-c1, combat-riders-30]: every registration is guarded. A sync throw in one of
// the module's own handlers is logged as `pentaryn-combat | <label>` (not Foundry's "Error thrown in
// hooked function"), the next listener still runs, return values (a veto) pass through, and a
// rejected promise is logged instead of surfacing as an unhandled rejection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureConsole, drain, setupWorld } from "./fixtures/world.mjs";

const W = await setupWorld();
const { F } = W;
const lines = captureConsole();
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();
const { reg } = await import("../context.mjs");

test("every module registration is guarded (wrapped), each with a label", () => {
  for (const r of reg.ids()) assert.ok(r.label, JSON.stringify(r));
});

test("a throwing handler: one `pentaryn-combat | <label>` error line, no Foundry hook error", () => {
  lines.length = 0;
  F.hookErrors.length = 0;
  // a combat with no combatants collection: the turn-boundary handler throws reading it
  F.Hooks.callAll("combatTurnChange", {}, { round: 1, turn: 0, combatantId: "a000000000000001" }, { round: 1, turn: 1, combatantId: "b000000000000001" });
  const ours = lines.filter(l => l.text.startsWith("pentaryn-combat | "));
  assert.deepEqual(ours.map(l => [l.level, l.text]), [["error", "pentaryn-combat | turn boundary"]]);
  assert.deepEqual(F.hookErrors, []);
});

test("the kit guard passes a veto through and logs an async rejection (no unhandled rejection)", async () => {
  const seen = [];
  const onUnhandled = e => seen.push(e);
  process.on("unhandledRejection", onUnhandled);
  try {
    const id1 = reg.on("pentaryn-combat.test.veto", () => false, { label: "veto" });
    assert.equal(F.Hooks.call("pentaryn-combat.test.veto"), false);
    reg.off(id1);
    lines.length = 0;
    const id2 = reg.on("pentaryn-combat.test.async", async () => { throw new Error("later"); }, { label: "async" });
    F.Hooks.callAll("pentaryn-combat.test.async");
    await drain();
    reg.off(id2);
    assert.deepEqual(lines.map(l => [l.level, l.text, l.err]), [["error", "pentaryn-combat | async", "later"]]);
    assert.deepEqual(seen, []);
  } finally { process.off("unhandledRejection", onUnhandled); }
});
