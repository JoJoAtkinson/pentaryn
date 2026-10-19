// The hook manifest: what aoe registers, in order, pinned against golden/hooks.json. Order WITHIN a
// name is behaviour (three dnd5e.renderChatMessage decorators, two createChatMessage jobs, and two
// dnd5e.postUseActivity listeners where Careful Spell's must run before refund's literal
// false stops the rest), and S5 keeps today's FEATURES order, so the full order is pinned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F } = await boot();
const S = await seams();
const afterFeatureImports = F.hooks.length;
await import("../aoe.mjs");
const atLoad = F.hooks.slice();
F.fire("init");
const atInit = F.hooks.length;
F.fire("setup");
const atSetup = F.hooks.slice(atInit);
F.fire("ready");
await flush(8);                                   // the ready work settles; timers are not ticked
const atReady = F.hooks.slice(atInit + atSetup.length);
const golden = F.hooks.slice();
await advance(0);                                 // the one-tick Argon check
const afterTick = F.hooks.slice(golden.length);

test("-12 importing every feature file registers nothing (hooks only inside install*())", () => {
  assert.equal(afterFeatureImports, 0);
  assert.deepEqual(S.hooks.hookIds().filter(h => h.name !== "canvasReady").length, atSetup.filter(h => h.name !== "canvasReady").length);
});

test("module scope: once init, once setup, once ready; init registers no hook", () => {
  assert.deepEqual(atLoad, [{ kind: "once", name: "init" }, { kind: "once", name: "setup" }, { kind: "once", name: "ready" }]);
  assert.equal(atInit, 3);
});

test("registration manifest (init + setup + ready as the active GM) equals golden/hooks.json", () => {
  pinJSON("hooks", golden, import.meta.url);
});

test("setup registers the feature hooks in Part order: areas, token areas, resolve, tray, attacks, effects, refund, aim", () => {
  assert.deepEqual(atSetup.map(h => `${h.kind} ${h.name}`), [
    "on preCreateRegion", "on createRegion", "on deleteRegion", "on preCreateCombatant", "on targetToken", "on preMoveToken",
    "on dnd5e.renderChatMessage", "on deleteActiveEffect", "on canvasReady",
    "on dnd5e.createMeasuredTemplate", "on renderTokenHUD",
    "on dnd5e.postUseActivity", "on createChatMessage", "on preDeleteChatMessage", "on deleteChatMessage", "on updateChatMessage",
    "on dnd5e.renderChatMessage",
    "on dnd5e.postRollAttack",
    "on createChatMessage", "on dnd5e.renderChatMessage", "on preCreateActiveEffect",
    "on dnd5e.postUseActivity",
    "on dnd5e.preCreateMeasuredTemplate",
  ]);
});

test("[declared] aoe-edge-3 ready (active GM, no ui.ARGON) adds no hook (the canvasReady sweep is wired at setup); the Argon fallback comes a tick later", () => {
  assert.deepEqual(atReady, []);
  assert.deepEqual(afterTick, [{ kind: "once", name: "canvasReady" }]);
});

test("after the lifecycle, every on() listener is live once", () => {
  const live = F.listeners();
  for (const name of ["init", "setup", "ready"]) assert.equal(live[name], undefined, name);
  assert.equal(live["dnd5e.renderChatMessage"], 3);
  assert.equal(live.createChatMessage, 2);
  assert.equal(live["dnd5e.postUseActivity"], 2);
});

test("the Careful arm runs before refund's veto on dnd5e.postUseActivity", () => {
  const ids = S.hooks.hookIds().filter(h => h.name === "dnd5e.postUseActivity").map(h => h.id);
  assert.equal(ids.length, 2);
  assert.ok(ids[0] < ids[1]);
  assert.equal(MODULE, "pentaryn-aoe");
});
