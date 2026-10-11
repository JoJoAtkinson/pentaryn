// Glue characterisation: the last ControlsLayer lookup (pings.mjs:164) — only
// CONFIG.Canvas.layers.controls.layerClass exists, and its prototype is wrapped. Its own process.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { ALPHA, GM, MODULE, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ layer: "config" });
const { F } = W;
W.captureConsole();
delete globalThis.ControlsLayer;
await import("../pings.mjs");

test("CONFIG.Canvas.layers.controls.layerClass is wrapped when it is the only one", async () => {
  F.fire("init");
  F.fire("ready");
  assert.equal(W.ControlsLayer.prototype.handlePing.__pentarynPatched, true);
  assert.equal(await new W.ControlsLayer().handlePing(F.game.users.get(GM), { x: 3, y: 4 }, { scene: ALPHA }), "drawn");
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "settings.set" && c.id === `${MODULE}.log`).map(c => c.value.map(r => [r.x, r.y])), [[[3, 4]]]);
  assert.deepEqual(W.console, [["log", "pentaryn-pings | ready — 0 ping(s) on record"]]);
});
