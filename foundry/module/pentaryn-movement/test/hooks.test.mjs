// The hook manifest (guide S1): what movement registers, in order, pinned in golden/hooks.json. Also the
// setup path where none of the wrapped methods exists: today's three warn texts, byte for byte.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { movementWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await movementWorld({ patchable: false });
await import("../movement.mjs");
const atLoad = F.hooks.slice();

test("registration manifest equals golden/hooks.json (34 entries, today's order; 0.3.0 appends pathfind's 15)", () => {
  pinJSON("hooks", atLoad, import.meta.url);
  assert.deepEqual(atLoad.map(h => (h.kind === "once" ? `once ${h.name}` : h.name)), [
    "once init", "once setup", "getSceneControlButtons", "renderSceneControls", "drawTokenLayer", "canvasReady",
    "refreshToken", "updateActor", "updateToken", "createCombat", "updateCombat", "deleteCombat",
    "createCombatant", "updateCombatant", "deleteCombatant", "createToken", "deleteToken", "renderTokenHUD",
    "once setup", "createWall", "updateWall", "deleteWall", "createRegion", "updateRegion", "deleteRegion",
    "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior", "createToken", "updateToken", "deleteToken", "controlToken",
    "canvasReady", "once ready",
  ]);
});

test("setup with none of the three methods: three warns, byte for byte; status().patched both false", () => {
  const warns = [];
  const saved = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  try {
    F.fire("init");
    F.fire("setup");
  } finally {
    console.warn = saved;
  }
  assert.deepEqual(warns, [
    "pentaryn-movement | no Token#_getDragConstrainOptions; ghost drag disabled",
    "pentaryn-movement | no TokenLayer#_prepareKeyboardMovementUpdates; ghost arrow keys disabled",
    "pentaryn-movement | no Token#findMovementPath; drag pathfinding disabled",
  ]);
  F.fire("ready");
  mock.timers.tick(0);
  assert.deepEqual(game.pentaryn.movement.status().patched, { drag: false, keyboard: false });
  assert.equal(game.pentaryn.movement.pathfind.status().patched, false);
});
