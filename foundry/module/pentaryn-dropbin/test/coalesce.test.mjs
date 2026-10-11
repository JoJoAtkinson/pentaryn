// items-journal-19 [declared]: a burst of entries is written as few counter + log writes as the queue
// allows (5 in one tick → at most 2 of each), every caller still gets its own number, and the JSON
// mirror is uploaded once, 2 s after the burst. export() writes at once and cancels a pending mirror.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { dropbinWorld, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });
const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" });
await import("../dropbin.mjs");
F.fire("init");
F.fire("ready");

const realSet = game.settings.set.bind(game.settings);
game.settings.set = (ns, key, value) => new Promise(r => setTimeout(() => r(realSet(ns, key, value)), 0));
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const item = name => ({ item: { name, type: "loot", system: { quantity: 1 }, toObject() { return { name, type: "loot", system: { quantity: 1 } }; } }, quantity: 1 });
async function quiet(fn) {
  const lines = [];
  const keep = console.log;
  console.log = (...a) => lines.push(String(a[0]));
  try { await fn(); } finally { console.log = keep; }
  return lines;
}

test("five drops in one tick: n 1..5, the store equals five sequential appends, ≤ 2 counter and ≤ 2 log writes", async () => {
  const from = F.calls.length;
  const lines = await quiet(async () => {
    Hooks.callAll("item-piles-dropItem", { actor: ann }, "Scene.x.Token.y", ["A", "B", "C", "D", "E"].map(item), {});
    for (let i = 0; i < 20; i++) { mock.timers.tick(0); await flush(); }
  });
  assert.deepEqual(lines, ["A", "B", "C", "D", "E"].map((x, i) => `pentaryn-dropbin | #${i + 1} drop: ${x} from Ann`));
  const log = game.pentaryn.dropbin.all();
  assert.deepEqual(log.map(e => [e.n, e.itemName]), [[1, "A"], [2, "B"], [3, "C"], [4, "D"], [5, "E"]]);
  assert.equal(game.settings.get(MOD, "counter"), 5);
  const sets = F.calls.slice(from).filter(c => c.op === "settings.set");
  assert.ok(sets.filter(c => c.id === `${MOD}.counter`).length <= 2, JSON.stringify(sets.map(c => c.id)));
  assert.ok(sets.filter(c => c.id === `${MOD}.log`).length <= 2);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "upload"), [], "no mirror yet");
});

test("the mirror uploads once, 2 s after the burst, with the whole ledger", async () => {
  const from = F.calls.length;
  mock.timers.tick(1999);
  await flush();
  assert.equal(F.calls.slice(from).filter(c => c.op === "upload").length, 0);
  mock.timers.tick(1);
  await flush();
  const ups = F.calls.slice(from).filter(c => c.op === "upload");
  assert.equal(ups.length, 1);
  assert.equal(ups[0].bytes, JSON.stringify(game.pentaryn.dropbin.all(), null, 2).length);
});

test("export() writes at once and cancels a pending debounced mirror", async () => {
  await quiet(async () => {
    Hooks.callAll("item-piles-dropItem", { actor: ann }, "Scene.x.Token.y", [item("F")], {});
    for (let i = 0; i < 10; i++) { mock.timers.tick(0); await flush(); }
  });
  const from = F.calls.length;
  const out = game.pentaryn.dropbin.export();
  for (let i = 0; i < 10; i++) { mock.timers.tick(0); await flush(); }
  assert.equal(await out, true);
  assert.equal(F.calls.slice(from).filter(c => c.op === "upload").length, 1);
  mock.timers.tick(5000);
  await flush();
  assert.equal(F.calls.slice(from).filter(c => c.op === "upload").length, 1, "the cancelled debounce never fires");
});

test("the GM's ready line carries the ledger's approximate size", async () => {
  const { ledgerKB } = await import("../dropbin-core.mjs");
  assert.equal(ledgerKB([]), 0);
  assert.equal(ledgerKB([{ n: 1 }]), 1, "never 0 KB for a non-empty ledger");
  assert.equal(ledgerKB(Array.from({ length: 100 }, (_, n) => ({ n, pad: "x".repeat(100) }))), Math.round(JSON.stringify(Array.from({ length: 100 }, (_, n) => ({ n, pad: "x".repeat(100) }))).length / 1024));
});
