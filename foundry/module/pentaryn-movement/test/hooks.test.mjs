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

test("registration manifest equals golden/hooks.json (entries in today's order; 0.3.0 appends pathfind's 15, 0.4.0 the drop's and stop's setup and stop's moveToken, 0.4.1 stop's canvasReady, 0.4.2 stop's updateToken, 0.4.11 stop's refreshToken, 0.8.0 telemetry's canvasReady; 0.9.0 the drop (was group): its preMoveToken, undo-entry updateToken, createWall and updateWall, then the file's group-tag updateToken (and since step 4 its fight queue's deleteToken, updateCombat and deleteCombat); the reservations, the guard, the reload resumes, tier C and the waiting cue gone; 49 since step 4; 0.10 L2 ghost's updateToken also lifts a moving group's leader)", () => {
  pinJSON("hooks", atLoad, import.meta.url);
  assert.deepEqual(atLoad.map(h => (h.kind === "once" ? `once ${h.name}` : h.name)), [
    "once init", "once setup", "getSceneControlButtons", "renderSceneControls", "drawTokenLayer", "canvasReady",
    "refreshToken", "updateActor", "updateToken", "createCombat", "updateCombat", "deleteCombat",
    "createCombatant", "updateCombatant", "deleteCombatant", "createToken", "deleteToken", "renderTokenHUD",
    "once setup", "createWall", "updateWall", "deleteWall", "createRegion", "updateRegion", "deleteRegion",
    "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior", "createToken", "updateToken", "deleteToken", "controlToken",
    "canvasReady", "once setup", "preMoveToken", "updateToken", "createWall", "updateWall", "updateToken",
    "deleteToken", "updateCombat", "deleteCombat",
    "once setup", "moveToken", "updateToken", "canvasReady", "refreshToken",
    "canvasReady", "once ready",
  ]);
});

test("setup with none of the seven methods: seven warns, byte for byte; status().patched both false", () => {
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
    "pentaryn-movement | no Token#_prepareDragLeftDropUpdates; drop help disabled",
    "pentaryn-movement | no Token#_onClickLeft; click to stop disabled",
    "pentaryn-movement | no Token#stopAnimation; a stop seen by another client may log core's 'chain' TypeError",
    "pentaryn-movement | no CanvasAnimation.animate; a stop on a slow page may miss a running tween",
  ]);
  F.fire("ready");
  mock.timers.tick(0);
  assert.deepEqual(game.pentaryn.movement.status().patched, { drag: false, keyboard: false });
  assert.equal(game.pentaryn.movement.pathfind.status().patched, false);
});
