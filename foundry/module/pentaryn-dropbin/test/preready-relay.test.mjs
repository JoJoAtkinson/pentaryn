// DB-AC-2 [declared]: the "record" relay is registered at socketlib.ready, before the world is ready.
// An entry relayed to a GM tab in that window is held (no settings.set before ready) and recorded at
// ready, in arrival order, through appendLedger; the relay's promise resolves with its ledger number.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { dropbinWorld, GM } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await dropbinWorld();
const handlers = {};
globalThis.socketlib = {
  registerModule: () => ({ register: (name, fn) => { handlers[name] = fn; }, executeAsGM: () => 99 }),
};
await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const entry = itemName => ({ t: 0, reason: "delete", itemName, userId: GM, fromActorId: "a", fromActorName: "Ann", quantity: 1, item: null });   // makeEntry always writes item and userId (dropbin-R10, DB-AC-3 check them)
const writes = () => F.calls.filter(c => c.op === "settings.set");

test("DB-AC-2: a relayed entry before ready writes nothing, then is recorded at ready in arrival order", async () => {
  const keep = console.log;
  console.log = () => {};
  try {
    assert.equal(game.ready, false);
    const first = handlers.record(entry("Sword"));
    const second = handlers.record(entry("Shield"));
    await flush();
    assert.deepEqual(writes(), [], "no settings.set before ready");

    F.fire("ready");
    await flush();
    assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    const log = game.settings.get("pentaryn-dropbin", "log");
    assert.deepEqual(log.map(e => [e.n, e.itemName]), [[1, "Sword"], [2, "Shield"]]);

    // after ready the relay records at once, as before
    const third = handlers.record(entry("Bow"));
    await flush();
    assert.equal(await third, 3);
  } finally {
    console.log = keep;
  }
});
