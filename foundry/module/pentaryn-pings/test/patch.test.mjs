// Guide step 4: the handlePing wrap goes through the kit's wrapMethod. New pin: the kit's patch record
// names the adjustments row `pings-core-ping-handle`, with today's marker literal. The wrap's
// behaviour (once, idempotent, original still runs, this/args/return kept, warn texts) stays pinned
// in glue.test.mjs and the glue-layers tests. Its own process.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { ALPHA, GM, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F } = W;
W.captureConsole();
await import("../pings.mjs");
const { patches } = await import("../lib/patch.mjs");

test("one kit patch record: ControlsLayer#handlePing, marker __pentarynPatched, row pings-core-ping-handle", async () => {
  F.fire("init");
  F.fire("ready");
  assert.deepEqual(patches(), [{
    moduleId: "pentaryn-pings",
    label: "ControlsLayer#handlePing",
    name: "handlePing",
    marker: "__pentarynPatched",
    via: "direct",
    adjustments: "pings-core-ping-handle",
  }]);
  assert.equal(W.ControlsLayer.prototype.handlePing.__pentarynPatched, true);
  assert.equal(await new W.ControlsLayer().handlePing(F.game.users.get(GM), { x: 5, y: 6 }, { scene: ALPHA }), "drawn");
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().map(r => [r.x, r.y]), [[5, 6]]);
});
