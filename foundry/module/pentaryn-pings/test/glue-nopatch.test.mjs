// Glue characterisation: no ControlsLayer#handlePing anywhere (capture.mjs patchControlsLayer). The GM ready warns
// once with the verbatim text and carries on with the socket path and the readers. Its own process.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { BETA, MODULE, PLAYER, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ layer: "none", seed: [{ t: 1, userId: PLAYER, userName: "Rook", sceneId: BETA, sceneName: "Beta", x: 5, y: 6 }] });
const { F } = W;
W.captureConsole();
await import("../pings.mjs");

test("no handlePing to patch: one warning, socket path and readers still work", async () => {
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  assert.equal(W.ControlsLayer.prototype.handlePing, W.original, "the unregistered stub class is untouched");
  assert.deepEqual(W.console.splice(0), [
    ["warn", "pentaryn-pings | no ControlsLayer#handlePing to patch — local pings will rely on the socket path only"],
    ["log", "pentaryn-pings | ready — 1 ping(s) on record"],
  ]);
  assert.deepEqual(W.socket.map(([e]) => e), ["userActivity"]);
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 600, y: 500 }, ping: { scene: BETA } });
  mock.timers.tick(250);
  await drain();
  const sets = F.calls.filter(c => c.op === "settings.set" && c.id === `${MODULE}.log`);
  assert.deepEqual(sets.map(c => c.value.map(r => r.x)), [[5, 600]], "the seeded record is kept");
  assert.deepEqual(F.game.pentaryn.pings.recent().map(r => [r.x, r.image]), [[600, { x: 100, y: 100 }], [5, { x: -495, y: -394 }]]);
  assert.deepEqual(W.console, []);
});
