/**
 * Finding -14 [declared S-6]: light.reconcile() resolves to what it did; light.recent() keeps the
 * last 20; a debug line is gated by CONFIG.debug["pentaryn-senses"], and the writes are the same
 * with it on or off.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, since, ID, MODULE, NOW, GM, PLAYER } from "./fixtures/world.mjs";

const core = await import("../senses-core.mjs");

test("summarise (pure): from the plan, overridden by what was written", () => {
  const plan = { restore: [{ scene: "s", id: "t" }], remove: [], light: null, create: { scene: "s", x: 1, y: 2 } };
  assert.deepEqual(core.summarise(plan), { source: null, desired: null, restored: 1, removed: 0, lit: null, created: true, released: null, cleared: false });
  assert.deepEqual(core.summarise({ restore: [], remove: [{}, {}], light: { scene: "s", token: "t" }, create: null }, { source: "u", restored: 0, lit: null }),
    { source: "u", desired: null, restored: 0, removed: 2, lit: null, created: false, released: null, cleared: false });
  assert.deepEqual(core.summarise(null), { source: null, desired: null, restored: 0, removed: 0, lit: null, created: false, released: null, cleared: false });
});

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot();
await settle(mock);
const L = () => game.pentaryn.senses.light;
const light = () => game.actors.get(ID.hero).items.get(ID.light);
const CAST = `flags.${MODULE}.lightCast`;

async function castAndReconcile(target) {
  await light().update({ [CAST]: { scene: ID.s1, token: null, x: null, y: null, ...target, at: 1 } });
  await settle(mock);
  const mark = F.calls.length;
  const summary = await L().reconcile(light().uuid);
  await settle(mock);
  return { summary, calls: since(mark) };
}

test("reconcile resolves to its summary; the same writes with debug on and off; recent() keeps it", async t => {
  const debug = [];
  t.mock.method(console, "debug", (...a) => debug.push(a));
  await castAndReconcile({ token: ID.tStake });
  const off = await castAndReconcile({ x: 250, y: 250 });
  assert.deepEqual(off.summary, { source: light().uuid, desired: { scene: ID.s1, x: 250, y: 250 }, restored: 0, removed: 0, lit: null, created: false, released: null, cleared: false },
    "converged by the debounced reconcile already: nothing left to do");
  F.CONFIG.debug = { [MODULE]: true };
  await castAndReconcile({ token: ID.tStake });
  const on = await castAndReconcile({ x: 250, y: 250 });
  F.CONFIG.debug = {};
  assert.deepEqual(on.calls, off.calls);
  assert.deepEqual(on.summary, off.summary);
  const recent = L().recent();
  assert.ok(recent.length > 0 && recent.length <= 20);
  assert.deepEqual(recent.at(-1), on.summary);
  recent.at(-1).source = "mutated";
  assert.notEqual(L().recent().at(-1).source, "mutated", "copies");
  assert.ok(debug.length > 0 && debug.every(([line]) => line === `${MODULE} | reconcile`), "debug lines only while debug is on");
  const before = debug.length;
  await castAndReconcile({ token: ID.tStake });
  assert.equal(debug.length, before, "silent with debug off");
  await light().update({ [CAST]: null });
  await settle(mock);
});

test("recent() is capped at 20; a refused reconcile resolves to null", async () => {
  for (let i = 0; i < 25; i++) await L().reconcile(light().uuid);
  assert.equal(L().recent().length, 20);
  F.become({ userId: PLAYER });
  assert.equal(await L().reconcile(light().uuid), null, "not the active GM");
  F.become({ userId: GM });
});

// Review fix (-14): the ring keeps its own copies. The summary reconcile resolves to and the rows
// recent() hands out (desired included) can be changed by the caller without touching the ring.
test("the ring is not shared: mutating reconcile's summary or recent()'s desired leaves recent() as it was", async () => {
  const { summary } = await castAndReconcile({ x: 300, y: 300 });
  const kept = structuredClone(L().recent().at(-1));
  assert.deepEqual(kept.desired, { scene: ID.s1, x: 300, y: 300 });
  summary.source = "mutated";
  summary.desired.x = -1;
  L().recent().at(-1).desired.y = -1;
  assert.deepEqual(L().recent().at(-1), kept);
  await light().update({ [CAST]: null });
  await settle(mock);
});
