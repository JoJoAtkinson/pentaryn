// A fight's group drag, the pure side (0.10 step L3; plan §18.3; Joe's leader rule R6 / R7, 2026-11-24): the order the
// members walk in (the leader, then least walk left), where a walk may rest (the leader's checkpoints only on free
// squares: it passes through its own members), and where a member's speed runs out (the last free square its movement
// pays for). The glue's side (drop.mjs runFight / walkOne) is in drop.test.mjs "0.10 L3".
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld } from "./fixtures/grid.mjs";
import { planLead } from "../file-core.mjs";
import { fightWalk } from "../motion-core.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("L3 fightWalk: every square a checkpoint when all are free; no speed given, the whole way", () => {
  const w = fightWalk(5, { free: () => true });
  assert.deepEqual(w, { end: 4, paid: 4, checkpoints: [false, true, true, true, true], short: false, why: null });
});

test("L3 fightWalk (R6): the leader's squares inside its own members are no checkpoints; its walk still ends on its last square", () => {
  const inside = new Set([2, 3]);
  const w = fightWalk(6, { free: k => !inside.has(k) });
  assert.equal(w.end, 5);
  assert.deepEqual(w.checkpoints, [false, true, false, false, true, true]);
});

test("L3 fightWalk (R7): the speed runs out: the last square its movement pays for; when that one is inside a member, the last free one before it", () => {
  const costs = [0, 5, 10, 15, 20, 25];
  assert.deepEqual(fightWalk(6, { free: () => true, costs, left: 15 }), { end: 3, paid: 3, checkpoints: [false, true, true, true], short: true, why: "speed" });
  // Square 3 (15 ft) inside a member: back to square 1 (5 ft, square 2 is inside one too).
  const w = fightWalk(6, { free: k => k !== 2 && k !== 3, costs, left: 15 });
  assert.deepEqual([w.end, w.paid, w.short, w.why], [1, 3, true, "speed"]);
  assert.deepEqual(w.checkpoints, [false, true]);
  // Not even one square: it does not move.
  assert.deepEqual(fightWalk(6, { free: () => true, costs, left: 4 }), { end: 0, paid: 0, checkpoints: [false], short: true, why: "speed" });
  // Exactly enough for the whole way: not short.
  assert.deepEqual(fightWalk(6, { free: () => true, costs, left: 25 }).short, false);
  // A non-finite or missing allowance: no usable speed, the whole way (a single drag's rule).
  for (const left of [null, undefined, Infinity, NaN]) assert.equal(fightWalk(6, { free: () => true, costs, left }).end, 5, String(left));
});

test("L3 fightWalk: 200 seeded walks: the end is free, paid for and never one past the last such square", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(500 + seed);
    const n = 2 + Math.floor(r() * 14);
    const free = Array.from({ length: n }, (_, k) => k === 0 || k === n - 1 || r() < 0.7);
    const costs = [0];
    for (let k = 1; k < n; k++) costs.push(costs[k - 1] + (r() < 0.2 ? 10 : 5));
    const left = r() < 0.15 ? null : Math.floor(r() * (costs.at(-1) + 10));
    const w = fightWalk(n, { free: k => free[k], costs, left });
    const pays = k => left === null || costs[k] <= left;
    const best = [...Array(n).keys()].filter(k => k > 0 && free[k] && pays(k)).at(-1) ?? 0;
    assert.equal(w.end, best, `seed ${seed}: ${JSON.stringify({ free, costs, left })}`);
    assert.equal(w.checkpoints.length, best + 1);
    for (let k = 1; k <= best; k++) assert.equal(w.checkpoints[k], free[k], `seed ${seed}: square ${k}`);
  }
});

test("L3 the fight's order (R7): planLead's byWalk is the leader, then least walk left (ties by id), whatever slots the plan gives out", () => {
  const room = Array.from({ length: 14 }, (_, i) => (i === 0 || i === 13 ? "#".repeat(30) : "#" + ".".repeat(28) + "#")).join("\n");
  const g = gridWorld(room);
  const step = (a, b) => g.free(b.i, b.j) && (a.i === b.i || a.j === b.j || (g.free(a.i, b.j) && g.free(b.i, a.j)));
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(9100 + seed);
    const n = 2 + Math.floor(r() * 10);
    const taken = new Set();
    const members = [];
    while (members.length < n) {
      const i = 1 + Math.floor(r() * 12), j = 1 + Math.floor(r() * 12);
      if (taken.has(`${i},${j}`)) continue;
      taken.add(`${i},${j}`);
      members.push({ id: `m${members.length}`, w: 1, h: 1, r: 0.5, start: { x: j + 0.5, y: i + 0.5 } });
    }
    const leaderId = members[Math.floor(r() * n)].id;
    const drop = { x: 20.5 + Math.floor(r() * 6), y: 1.5 + Math.floor(r() * 12) };
    const target = r() < 0.5 ? null : { id: "T", x: drop.x, y: drop.y, w: 1, h: 1 };
    const plan = planLead({ members, leaderId, drop, target, standing: target ? [{ id: "T", x: drop.x, y: drop.y, r: 0.5 }] : [] }, { walkable: g.walkable, step });
    assert.equal(plan.byWalk[0], leaderId, `seed ${seed}: the leader first`);
    assert.deepEqual([...plan.byWalk].sort(), members.map(m => m.id).sort(), `seed ${seed}: everyone once`);
    const left = id => plan.members[id].left;
    for (let k = 2; k < plan.byWalk.length; k++) {
      const a = plan.byWalk[k - 1], b = plan.byWalk[k];
      assert.ok(left(a) < left(b) - 1e-9 || (Math.abs(left(a) - left(b)) <= 1e-9 && a < b), `seed ${seed}: ${a} (${left(a)}) before ${b} (${left(b)})`);
    }
  }
});

test("L3 stopOrder: one stop of several walkers settles the front ones first (of two overlapping where they are drawn, the one walking toward the other is behind it); otherwise the given order", async () => {
  const { stopOrder } = await import("../motion-core.mjs");
  // A file walking east, drawn overlapping: c (front), b, a (back), listed back to front.
  const east = { x: 1, y: 0 };
  assert.deepEqual(stopOrder([{ id: "a", at: { x: 3.8, y: 1 }, dir: east, r: 0.5 }, { id: "b", at: { x: 4.4, y: 1 }, dir: east, r: 0.5 }, { id: "c", at: { x: 5, y: 1 }, dir: east, r: 0.5 }]), ["c", "b", "a"]);
  // Apart: the given order.
  assert.deepEqual(stopOrder([{ id: "a", at: { x: 1, y: 1 }, dir: east, r: 0.5 }, { id: "b", at: { x: 5, y: 1 }, dir: east, r: 0.5 }]), ["a", "b"]);
  // Head to head: each walks toward the other as much: the given order.
  assert.deepEqual(stopOrder([{ id: "a", at: { x: 1, y: 1 }, dir: east, r: 0.5 }, { id: "b", at: { x: 1.6, y: 1 }, dir: { x: -1, y: 0 }, r: 0.5 }]), ["a", "b"]);
  // One not walking (no direction): the walker coming at it is behind it.
  assert.deepEqual(stopOrder([{ id: "a", at: { x: 1, y: 1 }, dir: east, r: 0.5 }, { id: "b", at: { x: 1.6, y: 1 }, dir: null, r: 0.5 }]), ["b", "a"]);
  // Two files merging into one: the front of each first.
  const out = stopOrder([
    { id: "a2", at: { x: 2.4, y: 1 }, dir: east, r: 0.5 }, { id: "a1", at: { x: 3, y: 1 }, dir: east, r: 0.5 },
    { id: "b2", at: { x: 8, y: 1.6 }, dir: { x: 0, y: -1 }, r: 0.5 }, { id: "b1", at: { x: 8, y: 1 }, dir: { x: 0, y: -1 }, r: 0.5 },
  ]);
  assert.ok(out.indexOf("a1") < out.indexOf("a2") && out.indexOf("b1") < out.indexOf("b2"), JSON.stringify(out));
  // A jammed crowd (simulator seed 1447): one a square behind another without touching it settles after it when it is
  // near (margin), so the one in front can back off into its room.
  const crowd = [{ id: "back", at: { x: 13.4, y: 11.6 }, dir: east, r: 0.5 }, { id: "front", at: { x: 14.3, y: 10.8 }, dir: east, r: 0.5 }];
  assert.deepEqual(stopOrder(crowd), ["back", "front"], "apart: the given order");
  assert.deepEqual(stopOrder(crowd, { margin: 1.5 }), ["front", "back"], "near: the front one first");
});
