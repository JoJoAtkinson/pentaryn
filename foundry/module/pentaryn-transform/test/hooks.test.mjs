// The hook manifest (transform-creatures-8): what the two entries register, in order, pinned
// against golden/hooks.json. A change here is a behaviour change — listener order decides vetoes
// (dnd5e.preUseActivity) and render mutations (renderActionPanelArgonComponent).
//
// Load order is Foundry's: esmodules ["transform.mjs", "hud.mjs"]; hud.mjs imports starry.mjs, so
// starry's rows land between transform's and hud's. Checkpoint: 40 rows (the guide's 39 plus PT3-7's
// dnd5e.revertOriginalForm, registered right after preUpdateToken). [declared] guide step 8 (-16): 39 —
// starry's `once ready` (row 26) went: api.starry is a contribution built into the one frozen API.
// [declared] light-roundtrip: 40 — wildshape's preUpdateToken (row 6, after dnd5e.transformActor) puts
// the druid token's own light into dnd5e's previousTokenData on a shift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { setup } from "./fixtures/world.mjs";

const F = await setup();
const TD = F.TokenDocument;
const coreOp = TD._preUpdateOperation;
await import("../transform.mjs");
const afterEntry0 = F.hooks.length;
const patched = TD._preUpdateOperation;
await import("../hud.mjs");
const atLoad = F.hooks.slice();

test("registration manifest equals golden/hooks.json (40 rows; [declared] -16 removed starry's ready, light-roundtrip added a preUpdateToken)", () => {
  assert.equal(atLoad.length, 40);
  pinJSON("hooks", atLoad, import.meta.url);
});

test("entry 0 (transform.mjs) registers rows 1-19; starry.mjs (via hud.mjs) 20-26; hud.mjs 27-40", () => {
  assert.equal(afterEntry0, 19);
  assert.deepEqual(atLoad.slice(0, 3).map(h => h.name), ["preUpdateToken", "dnd5e.revertOriginalForm", "dnd5e.preUseActivity"]);
  assert.deepEqual(atLoad.slice(17, 19), [{ kind: "once", name: "ready" }, { kind: "once", name: "ready" }]);
  assert.deepEqual(atLoad.slice(19, 26).map(h => h.name), ["dnd5e.preUseActivity", "dnd5e.postUseActivity", "createActiveEffect",
    "updateActiveEffect", "deleteActiveEffect", "updateWorldTime", "dnd5e.restCompleted"]);
  assert.deepEqual(atLoad.slice(26, 29), [{ kind: "on", name: "updateToken" }, { kind: "on", name: "deleteToken" }, { kind: "once", name: "init" }]);
});

test("one capture-phase pointermove listener, added by hud.mjs before its first hook row", () => {
  const moves = F.D.listeners.filter(l => l.type === "pointermove");
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].options, { passive: true, capture: true });
  assert.equal(moves[0].at, 26, "registered after starry's 7 rows, before hud's updateToken");
  assert.equal(F.D.listeners.length, 1, "no other document listener");
});

test("the _preUpdateOperation patch is applied once at entry-0 evaluation, marked pentarynUnwrapped", () => {
  assert.notEqual(patched, coreOp);
  assert.equal(patched.pentarynUnwrapped, true);
  assert.equal(Object.hasOwn(TD, "_preUpdateOperation"), true);
  assert.equal(TD._preUpdateOperation, patched, "hud.mjs did not touch it");
});

test("re-evaluating the entry does not double-wrap (the marker guard)", async () => {
  await import("../transform.mjs?again");
  assert.equal(TD._preUpdateOperation, patched);
});

test("no patch without an own _preUpdateOperation, or without ForcedReplacement (guard conditions)", async () => {
  class Sub extends TD {}
  F.foundry.documents.TokenDocument = Sub;          // inherits, does not own it
  await import("../transform.mjs?inherited");
  assert.equal(Object.hasOwn(Sub, "_preUpdateOperation"), false);
  class Own { static _preUpdateOperation() { return "own"; } }
  F.foundry.documents.TokenDocument = Own;
  const ops = F.foundry.data.operators;
  F.foundry.data.operators = { ...ops, ForcedReplacement: undefined };
  await import("../transform.mjs?noops");
  assert.equal(Own._preUpdateOperation(), "own");
  assert.equal(Own._preUpdateOperation.pentarynUnwrapped, undefined);
  F.foundry.data.operators = ops;
  F.foundry.documents.TokenDocument = TD;
});
