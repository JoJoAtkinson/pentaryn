/**
 * Characterisation (senses checkpoint, wave 3), plan step 1 part of api.test: today's published
 * surface — `game.pentaryn.senses` (with `.light`) and `game.pentaryn.chain` — every path and its
 * function name, as the active GM after ready. Frozen once committed. Step 7 compares the kit
 * surface against this golden: it may differ ONLY by the kit members added and the two `uninstall`s
 * removed (C48, declared S-1), in a reviewed golden update in the declared commit.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, settle, surfaceOf, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
await boot();
await settle(mock);

test("surface: every published path and its function name (active GM, after ready)", () => {
  pinJSON("surface", { senses: surfaceOf(game.pentaryn.senses), chain: surfaceOf(game.pentaryn.chain) }, import.meta.url);
});

test("surface: the light API is the same object under senses.light; constants are today's tables", () => {
  const L = game.pentaryn.senses.light;
  assert.equal(L.PHB_LIGHT_ACTOR, "phbsplLight00000");
  assert.equal(Object.isFrozen(L.SPELL_LIGHT), true);
  assert.equal(L.profileFor({ name: "Torch" }).dim, 40);
  assert.equal(L.profileFor({ name: "Light", type: "spell" }), null);
});
