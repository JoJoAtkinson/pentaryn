// dropbin-R10 [declared]: a malformed relayed entry cannot reject the coalesced batch it lands in.
// recordAsGM checks the entry's shape (object; reason 'drop'|'delete'; string itemName; numeric t and
// quantity; item null or an object) and resolves null with one prefixed warning for a bad one, and
// drain() catches per entry, so one failing append rejects only its own caller.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { dropbinWorld, GM } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
const handlers = {};
globalThis.socketlib = {
  registerModule: () => ({ register: (name, fn) => { handlers[name] = fn; }, executeAsGM: () => 99 }),
};
await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
F.fire("ready");
const { appendLedger, readLog } = await import("../settings.mjs");

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
async function quiet(fn) {
  const warns = [];
  const keep = [console.log, console.warn];
  console.log = () => {};
  console.warn = (...a) => warns.push(a);
  try { return { out: await fn(), warns }; } finally { [console.log, console.warn] = keep; }
}
const entry = (itemName, t = 0) => ({ t, reason: "drop", itemName, userId: GM, fromActorId: "a", fromActorName: "Ann", quantity: 1, item: null });

test("dropbin-R10: each malformed relayed entry resolves null with one prefixed warning and writes nothing", async () => {
  await settle(handlers.record(entry("Seed")));
  const bad = [
    null,
    "drop",
    { ...entry("Bad"), reason: "steal" },
    { ...entry("Bad"), itemName: 7 },
    { ...entry("Bad"), t: "0" },
    { ...entry("Bad"), quantity: "1" },
    { ...entry("Bad"), item: "Sword" },
  ];
  for (const e of bad) {
    const before = readLog().length;
    const { out, warns } = await quiet(() => settle(Promise.resolve(handlers.record(e))));
    assert.equal(out, null, JSON.stringify(e));
    assert.equal(warns.length, 1, JSON.stringify(e));
    assert.match(String(warns[0][0]), new RegExp(`^${MOD} \\| `));
    assert.equal(readLog().length, before, "nothing appended");
  }
});

test("dropbin-R10: a malformed entry relayed in the same tick as good ones leaves the good ones recorded", async () => {
  const { out } = await quiet(() => settle(Promise.all([
    handlers.record(entry("Good1", 10_000)),
    handlers.record(null),
    handlers.record(entry("Good2", 10_000)),
  ])));
  assert.equal(out[1], null);
  assert.ok(Number.isInteger(out[0]) && out[2] === out[0] + 1, JSON.stringify(out));
  assert.deepEqual(readLog().slice(-2).map(e => e.itemName), ["Good1", "Good2"]);
});

test("dropbin-R10: drain catches per entry — one failing append rejects only its caller, the batch is still written", async () => {
  const first = appendLedger(entry("Lead", 20_000));        // starts a write
  const good = appendLedger(entry("After", 20_000));        // these two coalesce into the next batch
  const broken = appendLedger(null);                        // appendEntry throws on it (dedupeKey of null)
  const late = appendLedger(entry("Late", 20_000));
  const [r1, r2, r3, r4] = await settle(Promise.allSettled([first, good, broken, late]));
  assert.equal(r1.status, "fulfilled");
  assert.equal(r2.status, "fulfilled");
  assert.equal(r3.status, "rejected");
  assert.equal(r4.status, "fulfilled");
  assert.equal(r4.value.n, r2.value.n + 1);
  assert.deepEqual(readLog().slice(-3).map(e => e.itemName), ["Lead", "After", "Late"]);
  assert.equal(game.settings.get(MOD, "counter"), r4.value.n);
});
