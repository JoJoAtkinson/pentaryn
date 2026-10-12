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

test("one kit patch record: ControlsLayer#handlePing, marker __pentarynPingsPatched, row pings-core-ping-handle", async () => {
  F.fire("init");
  F.fire("ready");
  assert.deepEqual(patches(), [{
    moduleId: "pentaryn-pings",
    label: "ControlsLayer#handlePing",
    name: "handlePing",
    marker: "__pentarynPingsPatched",
    via: "direct",
    adjustments: "pings-core-ping-handle",
  }]);
  assert.equal(W.ControlsLayer.prototype.handlePing.__pentarynPingsPatched, true);
  assert.equal(await new W.ControlsLayer().handlePing(F.game.users.get(GM), { x: 5, y: 6 }, { scene: ALPHA }), "drawn");
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().map(r => [r.x, r.y]), [[5, 6]]);
});

test("pings-ext-1 [declared]: a foreign wrapper on top → uninstall() keeps the record; a hot re-import does not wrap twice", async () => {
  const proto = W.ControlsLayer.prototype;
  const ours = proto.handlePing;
  let foreignCalls = 0;
  const foreign = function (...args) {
    foreignCalls++;
    return ours.apply(this, args);
  };
  proto.handlePing = foreign;
  const row = patches();

  F.game.pentaryn.pings.uninstall();
  assert.equal(proto.handlePing, foreign, "the foreign wrapper is left in place");
  assert.deepEqual(patches(), row, "undo failed, so the patch is still recorded (describe().patches still lists it)");

  await import("../pings.mjs?v=2");
  assert.equal(proto.handlePing, foreign, "the re-import got the existing handle: no second wrap over the foreign one");
  assert.deepEqual(patches(), row, "still one record");
  assert.deepEqual(F.game.pentaryn.pings.describe().patches.map(p => p.adjustments), ["pings-core-ping-handle"]);
  const before = W.stored().length;
  assert.equal(await new W.ControlsLayer().handlePing(F.game.users.get(GM), { x: 70, y: 80 }, { scene: ALPHA }), "drawn");
  assert.equal(foreignCalls, 1);
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().slice(before).map(r => [r.x, r.y]), [[70, 80]], "the live patch still captures, once");

  // the foreign wrapper goes away: the next uninstall() undoes ours through the same handle
  proto.handlePing = ours;
  F.game.pentaryn.pings.uninstall();
  assert.equal(proto.handlePing, W.original, "the original is back");
  assert.deepEqual(patches(), []);
});
