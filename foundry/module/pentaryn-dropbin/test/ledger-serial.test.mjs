// items-journal-18, step 8 [declared]: appendLedger serialises read → decide → write for the counter and
// the log. A settings store that lands each write a tick later (as a real Setting round trip does).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { dropbinWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await dropbinWorld();
const { registerSettings, appendLedger, clearLog, readLog, setting } = await import("../settings.mjs");
registerSettings();

const realSet = game.settings.set.bind(game.settings);
let failNext = 0;
game.settings.set = (ns, key, value) => new Promise((resolve, reject) => setTimeout(() => {
  if (failNext > 0) { failNext--; reject(new Error("write refused")); return; }
  resolve(realSet(ns, key, value));
}, 0));

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function settle(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 100 && !done; i++) {
    mock.timers.tick(0);
    await flush();
  }
  return promise;
}
const entry = (itemName, t = 0) => ({ t, reason: "drop", itemName, fromActorId: "a", fromActorName: "Ann", quantity: 1 });
const reset = async () => {
  await settle(Promise.all([realSet("pentaryn-dropbin", "log", []), realSet("pentaryn-dropbin", "counter", 0)]));
};

test("concurrent appends: consecutive numbers in submission order, every row kept", async () => {
  await reset();
  const out = await settle(Promise.all([appendLedger(entry("E1")), appendLedger(entry("E2")), appendLedger(entry("E3"))]));
  assert.deepEqual(out.map(r => r.n), [1, 2, 3]);
  assert.deepEqual(readLog().map(e => [e.n, e.itemName]), [[1, "E1"], [2, "E2"], [3, "E3"]]);
  assert.equal(setting("counter"), 3);
});

test("sequential, duplicate within 2000 ms and +2001 ms behave as before", async () => {
  await reset();
  assert.equal((await settle(appendLedger(entry("A", 0)))).n, 1);
  const dup = await settle(appendLedger(entry("A", 1999)));
  assert.deepEqual([dup.n, dup.duplicate], [1, true]);
  assert.equal(readLog().length, 1);
  assert.equal((await settle(appendLedger(entry("A", 2001)))).n, 2);
});

test("a duplicate writes nothing", async () => {
  await reset();
  await settle(appendLedger(entry("B", 0)));
  const from = F.calls.length;
  await settle(appendLedger(entry("B", 10)));
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "settings.set"), []);
});

test("a failed write rejects that caller only; the next append still runs", async () => {
  await reset();
  failNext = 1;
  const first = appendLedger(entry("X"));
  const second = appendLedger(entry("Y"));
  await assert.rejects(settle(first), /write refused/);
  const r = await settle(second);
  assert.equal(r.n, 1, "the failed append wrote nothing, so Y takes #1");
  assert.deepEqual(readLog().map(e => e.itemName), ["Y"]);
});

test("clearLog waits for an append in flight, so the append cannot write the old log back over it", async () => {
  await reset();
  await settle(appendLedger(entry("old")));
  const pending = appendLedger(entry("late"));          // reads ["old"], writes ["old", "late"] a tick later
  const cleared = clearLog();
  await settle(Promise.all([pending, cleared]));
  assert.deepEqual(readLog(), [], "the clear lands last");
  assert.equal(setting("counter"), 2, "the counter is kept");
});

test("an append submitted after clearLog lands after the clear, even while a batch is waiting", async () => {
  await reset();
  const first = appendLedger(entry("a"));               // its write is in flight
  const waiting = appendLedger(entry("b"));             // waits in the next batch
  const cleared = clearLog();
  const late = appendLedger(entry("c"));                // asked for after the clear: must not be wiped by it
  const out = await settle(Promise.all([first, waiting, cleared, late]));
  assert.deepEqual([out[0].n, out[1].n, out[3].n], [1, 2, 3]);
  assert.deepEqual(readLog().map(e => e.itemName), ["c"], "the clear removes a and b, not c");
  assert.equal(setting("counter"), 3);
});
