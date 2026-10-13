/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 item 2): the hook manifest. What the entry
 * registers when it is evaluated (golden/hooks.json), and what `init` adds on top (overlay, worn, item
 * marks — golden/hooks-after-init.json). Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";

const F = await bootWorld({ importEntry: false });
await import("../pentaryn-ties.mjs");
const atLoad = F.hooks.slice();
F.fire("init");
const afterInit = F.hooks.slice(atLoad.length);

test("load-time registrations equal golden/hooks.json", () => {
  pinJSON("hooks", atLoad, import.meta.url);
  assert.deepEqual(atLoad.map(h => `${h.kind}:${h.name}`), [
    "once:init", "once:ready", "once:ready",
    "on:canvasReady", "on:combatStart", "on:deleteCombat", "on:updateCombat",
    "on:getSceneControlButtons", "on:renderTokenHUD",
    "on:canvasReady", "on:canvasPan", "on:canvasTearDown",
    "on:deleteActor",
    "on:renderNPCActorSheet", "on:renderCharacterActorSheet", "on:renderActorSheetV2", "on:renderActorSheet",
  ]);
});

test("init adds the overlay, worn and item-mark hooks (golden/hooks-after-init.json)", () => {
  pinJSON("hooks-after-init", afterInit, import.meta.url);
  assert.deepEqual(afterInit.map(h => `${h.kind}:${h.name}`), [
    "on:canvasTearDown", "on:canvasReady", "on:canvasPan", "on:refreshToken", "on:sightRefresh",
    "on:renderTokenHUD", "on:canvasTearDown", "on:canvasReady", "on:refreshToken", "on:createToken", "on:deleteToken", "on:updateToken",
    "on:renderBaseActorSheet",
  ]);
});

test("document listeners at load: pointerdown (capture), keydown", () => {
  assert.deepEqual(document.listeners.map(l => `${l.type}:${l.capture}`), ["pointerdown:true", "keydown:false"]);
});
