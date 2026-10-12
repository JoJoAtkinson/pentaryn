// [declared] D-A4: with Argon not up at ready, the one-tick check leaves a once canvasReady fallback.
// It goes through the registry, so uninstall() removes it before it fires (it used to be a raw
// Hooks.once that outlived uninstall).
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, MODULE } from "./fixtures/world.mjs";

const { F } = await boot({ entry: true });

test("D-A4: the pending Argon fallback is a registry once, labelled canvasReady(argon)", () => {
  const rec = game.pentaryn.aoe.hookIds().filter(h => h.name === "canvasReady");
  assert.equal(rec.length, 2, "the GM sweep and the Argon fallback");
  assert.equal(F.listeners("canvasReady"), 2);
});

test("D-A4: uninstall() removes it before it fires; a late Argon is then left alone", () => {
  game.pentaryn.aoe.uninstall();
  assert.equal(F.listeners("canvasReady"), 0);
  F.ui.ARGON = { bind: () => "b" };
  F.fire("canvasReady", { scene: null });
  assert.equal(F.ui.ARGON.bind._aoeGuard, undefined);
  assert.equal(MODULE, "pentaryn-aoe");
});
