// Guide S6c: the hand prototype patches go through the kit (C32). Every one is recorded with its
// adjustments row, applies once, and unwraps on uninstall.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";
import { patches } from "../lib/patch.mjs";

// No real timers: onReady's deferred weapon-set seed (DELAYS.seedAfterReady) stays parked unless ticked.
mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

test("describe-ready records: every patch names its combat- adjustments row", () => {
  const rows = patches().filter(p => p.moduleId === "pentaryn-combat").map(({ label, marker, adjustments }) => ({ label, marker, adjustments }));
  assert.ok(rows.length >= 4, JSON.stringify(rows));
  for (const r of rows) assert.match(r.adjustments, /^combat-/, r.label);
  const labels = rows.map(r => r.label);
  for (const l of ["PortraitPanel#getEffects", "ActionPanel#updateActionUse"]) assert.ok(labels.includes(l), l);
});

test("a second ready does not wrap again (the marker guards each site)", () => {
  const before = patches().length;
  const proto = CONFIG.ARGON.MAIN.ActionPanel.prototype;
  const fn = proto.updateActionUse;
  F.Hooks.callAll("ready");
  assert.equal(proto.updateActionUse, fn);
  assert.equal(patches().length, before);
});

test("uninstall unwraps every patch and removes every hook; the prototypes are as before", async () => {
  const { ctx } = await import("../context.mjs");
  const proto = CONFIG.ARGON.MAIN.ActionPanel.prototype;
  assert.equal(proto.updateActionUse._pcSettles, true);
  ctx.uninstall();
  assert.equal(proto.updateActionUse._pcSettles, undefined, "Argon's own method is back");
  assert.equal(Object.hasOwn(CONFIG.ARGON.PORTRAIT.PortraitPanel.prototype, "_pcConditions"), false);
  assert.deepEqual(patches().filter(p => p.moduleId === "pentaryn-combat"), []);
  assert.deepEqual(ctx.reg.ids(), []);
});
