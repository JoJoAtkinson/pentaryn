// perf-4 [declared]: the orphan flag sweep after a deleteCombat is one debounce, not one timer per
// delete, and a sweep still running is never re-entered. Deleting three combats at once sweeps once.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, captureConsole, drain, makeActor, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F } = W;
const lines = captureConsole();
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();

const orphan = id => makeActor({ id, name: "O", flags: { [MODULE]: { turn: { key: "gone:1:x" } } } });
const sweepWarns = () => lines.filter(l => l.level === "warn" && l.text === "pentaryn-combat | orphan flag sweep");

test("perf-4: three combats deleted at once sweep once, 1.5 s after the last delete", async () => {
  const O = orphan("orphanA000000001");
  const update = O.update;
  O.update = async () => { throw new Error("update refused"); };
  lines.length = 0;
  for (const id of ["d1", "d2", "d3"]) {
    F.Hooks.callAll("deleteCombat", { id, combatants: [] });
    mock.timers.tick(500);
  }
  await drain();
  assert.equal(sweepWarns().length, 0, "nothing swept before the last delete settles");
  mock.timers.tick(1000);
  await drain();
  O.update = update;
  assert.equal(sweepWarns().length, 1, "one sweep for the burst");
  O.flags[MODULE] = {};
});

test("perf-4: a sweep still running is not re-entered; the request is looked at again later", async () => {
  const O = orphan("orphanB000000001");
  const update = O.update;
  let calls = 0, release;
  O.update = (...a) => { calls++; return calls === 1 ? new Promise(r => { release = () => r(update.apply(O, a)); }) : update.apply(O, a); };
  F.Hooks.callAll("deleteCombat", { id: "e1", combatants: [] });
  mock.timers.tick(1500);
  await drain();
  assert.equal(calls, 1, "the first sweep is waiting on its write");
  F.Hooks.callAll("deleteCombat", { id: "e2", combatants: [] });
  mock.timers.tick(1500);
  await drain();
  assert.equal(calls, 1, "the second request did not start a sweep alongside the first");
  release();
  await drain();
  assert.deepEqual(O.flags[MODULE], {});
  mock.timers.tick(1500);
  await drain();
  assert.equal(calls, 1, "the re-armed look found nothing left to drop");
  O.update = update;
});
