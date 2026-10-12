// Glue characterisation: the ControlsLayer lookup order (capture.mjs patchControlsLayer) when foundry.canvas.layers
// has no ControlsLayer — globalThis.ControlsLayer wins over CONFIG.Canvas.layers.controls.layerClass.
// (glue.test pins foundry.canvas.layers winning over both.) Its own process.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { ALPHA, GM, MODULE, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ layer: "config" });
const { F } = W;
W.captureConsole();
const calls = [];
class GlobalLayer {
  handlePing(...args) {
    calls.push(args);
    return "global";
  }
}
const original = GlobalLayer.prototype.handlePing;
globalThis.ControlsLayer = GlobalLayer;
await import("../pings.mjs");

test("globalThis.ControlsLayer is patched before CONFIG's layerClass", async () => {
  F.fire("init");
  F.fire("ready");
  assert.equal(GlobalLayer.prototype.handlePing.__pentarynPatched, true);
  assert.equal(W.ControlsLayer.prototype.handlePing, W.original, "CONFIG.Canvas.layers.controls.layerClass untouched");
  assert.equal(new GlobalLayer().handlePing(F.game.users.get(GM), { x: 1, y: 2 }, { scene: ALPHA }), "global", "a sync original's value passes through");
  assert.deepEqual(calls, [[F.game.users.get(GM), { x: 1, y: 2 }, { scene: ALPHA }]]);
  assert.notEqual(GlobalLayer.prototype.handlePing, original);
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "settings.set" && c.id === `${MODULE}.log`).map(c => c.value.map(r => [r.x, r.y])), [[[1, 2]]]);
  assert.deepEqual(W.console, [["log", "pentaryn-pings | ready — 0 ping(s) on record"]]);
});
