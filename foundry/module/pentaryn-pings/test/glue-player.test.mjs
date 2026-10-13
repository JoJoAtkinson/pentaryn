// Glue characterisation on a player client (guide step 1; transform-creatures-39, pinned unchanged):
// init still registers both settings, but ready returns before anything else — no wrap, no socket
// listener, no namespace, no console line. Its own process: ready fires once per page.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, MODULE, PLAYER, ALPHA, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ player: true });
const { F } = W;
W.captureConsole();
await import("../pings.mjs");

test("player client: settings registered at init, as on every client", () => {
  F.fire("init");
  F.fire("setup");
  assert.deepEqual(F.calls.map(c => [c.op, c.id]), [
    ["settings.register", `${MODULE}.log`],
    ["settings.register", `${MODULE}.max`],
  ]);
});

test("player ready: no wrap, no userActivity listener, game.pentaryn.pings undefined (transform-creatures-39)", async () => {
  assert.equal(F.game.user.id, PLAYER);
  assert.equal(F.game.user.isGM, false);
  F.fire("ready");
  assert.equal(W.ControlsLayer.prototype.handlePing, W.original);
  assert.equal(W.ControlsLayer.prototype.handlePing.__pentarynPingsPatched, undefined);
  assert.deepEqual(W.socket, []);
  assert.equal(F.game.pentaryn?.pings, undefined);
  assert.equal(F.game.pentaryn, undefined, "the root is not even created");

  await new W.ControlsLayer().handlePing(F.game.users.get(GM), { x: 1, y: 1 }, { scene: ALPHA });
  mock.timers.tick(1000);
  await drain();
  assert.equal(F.calls.filter(c => c.op === "settings.set").length, 0, "a player client never writes");
  assert.deepEqual(W.console, []);
  assert.deepEqual(F.listeners(), {}, "both once listeners spent");
});
