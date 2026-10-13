// pings-rob-1 [declared]: a second ready without uninstall() — a hot re-import of the entry
// (`pings.mjs?v=2`) while the world is ready — runs capture.start() again on the same capture.mjs.
// Before the edge-1 design, start() re-read the store into the buffer, so a ping captured by the first
// load and not yet flushed was dropped, and the flush already due rewrote the old log over it. Now
// start() keeps this tab's pending pings and their flush; the store is only re-read through the log
// row's onChange and the serialStore write. Its own process: ready fires once per page.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { ALPHA, BETA, GM, MODULE, PLAYER, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ seed: [{ t: 1, userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ pings", x: 1, y: 2 }] });
const { F } = W;
F.game.modules.set(MODULE, { id: MODULE, active: true });
W.captureConsole();
await import("../pings.mjs");
F.fire("init");
F.fire("ready");

const gm = F.game.users.get(GM);
const layer = new W.ControlsLayer();
const xs = () => W.stored().map(r => r.x);

test("pings-rob-1: a hot re-import without uninstall() flushes the ping the first load captured", async () => {
  assert.equal(F.game.ready, true);
  layer.handlePing(gm, { x: 10, y: 10 }, { scene: ALPHA });
  const writes = W.log().length;
  await import("../pings.mjs?v=2");                    // second ready, no uninstall()
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(xs(), [1, 10], "the pending ping was kept and written");
  assert.equal(W.log().length, writes + 1, "one flush, no rewrite of the old log");
});

test("pings-rob-1: after the re-import, another tab's pings are merged with this tab's pending ones", async () => {
  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 20, y: 20 }, { scene: ALPHA });
  await F.game.settings.set(MODULE, "log", [...W.stored(), { t: Date.now(), userId: PLAYER, userName: "Rook", sceneId: BETA, sceneName: "Beta", x: 50, y: 0 }]);
  await import("../pings.mjs?v=3");
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(xs(), [1, 10, 50, 20]);
});
