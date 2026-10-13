// pings-maint-7 [declared]: another Pentaryn module's wrap of ControlsLayer#handlePing carries the
// generic marker `__pentarynPatched`. Pings uses its own marker `__pentarynPingsPatched`, so that
// foreign marker no longer stops pings from wrapping, and a ping drawn locally is still recorded.
// Its own process.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { ALPHA, GM, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F } = W;
W.captureConsole();

// a foreign module's wrapper, already in place, marked with the generic literal
const proto = W.ControlsLayer.prototype;
const below = proto.handlePing;
let foreignCalls = 0;
const foreign = function (...args) {
  foreignCalls++;
  return below.apply(this, args);
};
foreign.__pentarynPatched = true;
proto.handlePing = foreign;

await import("../pings.mjs");
const { patches } = await import("../lib/patch.mjs");

test("pings-maint-7 [declared]: a foreign __pentarynPatched marker on handlePing does not stop pings wrapping", async () => {
  F.fire("init");
  F.fire("ready");
  assert.notEqual(proto.handlePing, foreign, "pings wrapped on top of the foreign wrapper");
  assert.equal(proto.handlePing.__pentarynPingsPatched, true);
  assert.deepEqual(patches().map(p => [p.marker, p.via]), [["__pentarynPingsPatched", "direct"]]);
  assert.equal(await new W.ControlsLayer().handlePing(F.game.users.get(GM), { x: 9, y: 10 }, { scene: ALPHA }), "drawn");
  assert.equal(foreignCalls, 1, "the foreign wrapper still runs, once");
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().map(r => [r.x, r.y]), [[9, 10]], "the local ping is recorded");

  F.game.pentaryn.pings.uninstall();
  assert.equal(proto.handlePing, foreign, "uninstall() restores the foreign wrapper");
  assert.deepEqual(patches(), []);
});
