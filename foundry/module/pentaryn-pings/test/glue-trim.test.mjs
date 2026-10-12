// SF3 case C on a GM client: the log already holds `max` records when the first ping arrives. Its own
// process (ready fires once per page; the buffer is module state).
//
// appendCapped pushes into the buffer, which before any flush is the cached setting array, and then
// slices: the trimming ping lands in the cache (all() briefly returns max+1) and the buffer is detached
// from it, so later pings trail in the readers until the 250 ms write. Pinned as it is (README Pitfalls,
// "Read lag"); glue.test.mjs pins cases A and B.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { ALPHA, GM, MODULE, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const manifest = manifestOf(new URL("..", import.meta.url));
const seed = Array.from({ length: 50 }, (_, i) => ({
  t: 1 + i, userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ live-goldens pings", x: 1000 + i, y: 500,
}));
const W = await setupWorld({ seed });
const { F } = W;
F.game.modules.set(MODULE, { id: MODULE, active: true, version: manifest.version, title: manifest.title, flags: manifest.flags });
W.captureConsole();
await import("../pings.mjs");

test("KNOWN SF3 case C: a trim detaches the buffer — the trimming ping shows, all() is max+1, later pings lag until the flush", async () => {
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  const api = F.game.pentaryn.pings;
  const gm = F.game.users.get(GM);
  const layer = new W.ControlsLayer();
  assert.equal(api.all().length, 50, "the log holds max (default 50)");

  layer.handlePing(gm, { x: 1, y: 1 }, { scene: ALPHA });
  layer.handlePing(gm, { x: 2, y: 2 }, { scene: ALPHA });
  assert.equal(api.last().x, 1, "the trimming ping shows; the next one trails");
  assert.equal(api.all().length, 51, "the cache was pushed to before the slice");
  assert.equal(W.log().length, 0, "no write before 250 ms");

  mock.timers.tick(250);
  await drain();
  assert.equal(W.log().length, 1, "one write");
  assert.equal(W.log()[0].value.length, 50);
  assert.equal(api.last().x, 2);
  assert.equal(api.all().length, 50);
  assert.deepEqual(api.all().slice(-2).map(r => r.x), [1, 2]);
});
