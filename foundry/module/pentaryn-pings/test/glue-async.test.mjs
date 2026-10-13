// pings-async-1 [declared]: every log write on one tab — a flush and clear() — goes through the log's
// one serialStore queue (a Foundry Semaphore(1)), so a write slower than FLUSH_MS never overlaps the
// next one, and with no Setting document yet only one create happens. Fixed by the pings-edge-1 design;
// pinned here. Before it, flushTimer was cleared before the awaited write, so a slow write and the next
// flush (or a clear()) both ran settings.set at once. Its own process: ready fires once per page.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { ALPHA, GM, MODULE, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const SLOW_MS = 1000;   // one write takes four flush windows

const manifest = manifestOf(new URL("..", import.meta.url));
const W = await setupWorld();
const { F } = W;
F.game.modules.set(MODULE, { id: MODULE, active: true, version: manifest.version, title: manifest.title, flags: manifest.flags });

/* settings.set on the log: slow, and every start/end recorded with the value it writes */
const events = [];
let inFlight = 0;
let maxInFlight = 0;
const set = F.game.settings.set;
F.game.settings.set = async (namespace, key, value) => {
  if (key !== "log") return set(namespace, key, value);
  const xs = value.map(r => r.x);
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  events.push(["start", xs]);
  await new Promise(resolve => setTimeout(resolve, SLOW_MS));
  try {
    return await set(namespace, key, value);
  } finally {
    inFlight--;
    events.push(["end", xs]);
  }
};

W.captureConsole();
await import("../pings.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const api = F.game.pentaryn.pings;
const gm = F.game.users.get(GM);
const layer = new W.ControlsLayer();
const xs = () => W.stored().map(r => r.x);

test("pings-async-1: a write slower than FLUSH_MS followed by a ping is two ordered writes, never interleaved", async () => {
  layer.handlePing(gm, { x: 1, y: 1 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(events, [["start", [1]]], "the first flush is writing");

  layer.handlePing(gm, { x: 2, y: 2 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(events, [["start", [1]]], "the second flush waits for the first write");

  mock.timers.tick(SLOW_MS);
  await drain();
  mock.timers.tick(SLOW_MS);
  await drain();
  assert.deepEqual(events, [["start", [1]], ["end", [1]], ["start", [1, 2]], ["end", [1, 2]]]);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(xs(), [1, 2]);
});

test("pings-async-1: clear() during a slow flush waits for it, then writes [] once", async () => {
  events.splice(0);
  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 3, y: 3 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(events, [["start", [1, 2, 3]]]);

  const cleared = api.clear();
  await drain();
  assert.deepEqual(events, [["start", [1, 2, 3]]], "clear() is queued behind the flush");

  mock.timers.tick(SLOW_MS);
  await drain();
  mock.timers.tick(SLOW_MS);
  await drain();
  assert.equal(await cleared, true);
  assert.deepEqual(events, [["start", [1, 2, 3]], ["end", [1, 2, 3]], ["start", []], ["end", []]]);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(xs(), []);
});
