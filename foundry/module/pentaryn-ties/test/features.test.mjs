/**
 * Guide S7: the entry's features. Each exports install(reg, ctx) / uninstall(); installing one on a
 * fresh registry registers exactly the hooks it took out of the entry, in order; uninstall plus
 * reg.offAll() leaves no listener and no document listener behind. (The whole module's order is
 * golden/hooks.json, unchanged.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { hookRegistry } from "../lib/hooks.mjs";

const F = await bootWorld({ importEntry: false });
// the fixture's document records listeners but its removeEventListener is a no-op; make it real here
document.removeEventListener = function (type, fn, capture) {
  const i = this.listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === (capture === true));
  if (i >= 0) this.listeners.splice(i, 1);
};
const FEATURES = ["conduit", "token-hud", "look-menu", "sheet", "overlay", "worn", "item-marks"];

test("every feature exports install and uninstall", async () => {
  for (const f of FEATURES) {
    const m = await import(`../${f}.mjs`);
    assert.equal(typeof m.install, "function", f);
    assert.equal(typeof m.uninstall, "function", f);
  }
});

test("each feature's hooks, in order, on a registry of its own; uninstall + offAll removes them all", async () => {
  const want = {
    conduit: ["once:ready", "on:canvasReady", "on:combatStart", "on:deleteCombat", "on:updateCombat"],
    "token-hud": ["on:getSceneControlButtons", "on:renderTokenHUD"],
    "look-menu": ["on:canvasReady", "on:canvasPan", "on:canvasTearDown"],
    sheet: ["on:deleteActor", "on:renderNPCActorSheet", "on:renderCharacterActorSheet", "on:renderActorSheetV2", "on:renderActorSheet"],
    overlay: ["on:canvasTearDown", "on:canvasReady", "on:canvasPan", "on:refreshToken", "on:sightRefresh"],
    worn: ["on:renderTokenHUD", "on:canvasTearDown", "on:canvasReady", "on:refreshToken", "on:deleteToken", "on:updateToken"],
    "item-marks": ["on:renderBaseActorSheet"],
  };
  for (const f of FEATURES) {
    const m = await import(`../${f}.mjs`);
    const reg = hookRegistry("pentaryn-ties");
    const before = F.listeners();
    const docBefore = document.listeners.length;
    m.install(reg, { log: null, reg });
    assert.deepEqual(reg.ids().map(h => `${h.kind}:${h.name}`), want[f], f);
    m.uninstall();
    reg.offAll();
    assert.deepEqual(F.listeners(), before, `${f}: no listener left`);
    assert.equal(document.listeners.length, docBefore, `${f}: no document listener left`);
  }
});

test("look-menu adds the two document listeners at install (pointerdown capture, keydown) and removes them", async () => {
  const m = await import("../look-menu.mjs");
  const reg = hookRegistry("pentaryn-ties");
  const n = document.listeners.length;
  m.install(reg, {});
  assert.deepEqual(document.listeners.slice(n).map(l => `${l.type}:${l.capture}`), ["pointerdown:true", "keydown:false"]);
  m.uninstall();
  reg.offAll();
  assert.equal(document.listeners.length, n);
});
