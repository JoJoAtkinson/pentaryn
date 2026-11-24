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

test("L3 fix round settleAlong: a stop's tokens each along its own way, none resting inside another and no walk on through one at rest (the cascade a greedy stop misses: the one in front backs off first)", async () => {
  const { settleAlong, spotsAlong } = await import("../motion-core.mjs");
  const ok = () => true;
  // A file of three in a one-wide corridor walking east into a shut door at x = 6 (nothing ahead), drawn overlapping:
  // c at 5.5 (front, against the door), b at 5.0, a at 4.6. Greedy front first: c stays, b back to 4.5, a back to 3.5.
  const east = (x, y = 1) => ({ drawn: { x, y }, ahead: [], behind: [{ x: 0, y }] });
  const free = p => p.x <= 5.5 + 1e-9;                     // the door: nothing past 5.5
  const mk = (id, x) => ({ id, r: 0.5, ...east(x), cands: spotsAlong({ drawn: { x, y: 1 }, ahead: [], behind: [{ x: 0, y: 1 }], free, step: 0.05, aheadMax: 1.5, behindMax: Infinity }) });
  const items = [mk("c", 5.5), mk("b", 5.0), mk("a", 4.6)];
  const out = settleAlong(items);
  assert.ok(out, "solved");
  const at = id => out.get(id).p;
  assert.equal(at("c").x, 5.5, "the front one where it is drawn");
  assert.ok(Math.abs(at("b").x - 4.5) < 0.051 && Math.abs(at("a").x - 3.5) < 0.101, JSON.stringify([...out]));
  // The cascade (simulator seeds 6572, 9631): x was carried back through where y rests. y must back off first (it is
  // behind x's way), or x must not pass it: no solution leaves y on x's way at rest.
  const two = [
    { id: "x", r: 0.5, drawn: { x: 5, y: 1 }, cands: spotsAlong({ drawn: { x: 5, y: 1 }, ahead: [], behind: [{ x: 0, y: 1 }], free: p => p.x <= 4 + 1e-9, step: 0.05, aheadMax: 0, behindMax: Infinity }) },
    { id: "y", r: 0.5, drawn: { x: 3.6, y: 1 }, cands: spotsAlong({ drawn: { x: 3.6, y: 1 }, ahead: [{ x: 0, y: 1 }], behind: [{ x: 9, y: 1 }], free: ok, step: 0.05, aheadMax: 1.5, behindMax: 1.5 }) },
  ];
  const o2 = settleAlong(two);
  assert.ok(o2, "solved");
  const px = o2.get("x").p, py = o2.get("y").p;
  assert.ok(Math.hypot(px.x - py.x, px.y - py.y) >= 1 - 0.011, "apart at rest");
  const path = [two[0].drawn, ...o2.get("x").via, px];
  const near = Math.min(...path.slice(1).map((q, k) => {
    const a = path[k], L = Math.hypot(q.x - a.x, q.y - a.y) || 1, t = Math.max(0, Math.min(1, ((py.x - a.x) * (q.x - a.x) + (py.y - a.y) * (q.y - a.y)) / (L * L)));
    return Math.hypot(py.x - (a.x + (q.x - a.x) * t), py.y - (a.y + (q.y - a.y) * t));
  }));
  assert.ok(near >= 1 - 0.011, `x's walk on never passes y at rest: ${JSON.stringify([px, py])}`);
  // Nowhere: null (the caller keeps its own answer).
  assert.equal(settleAlong([{ id: "p", r: 0.5, drawn: { x: 1, y: 1 }, cands: [{ p: { x: 1, y: 1 }, via: [] }] }, { id: "q", r: 0.5, drawn: { x: 1.2, y: 1 }, cands: [{ p: { x: 1.2, y: 1 }, via: [] }] }]), null);
});

test("L3 ruling (seed 6142): a door shut is refused when the cut would leave a walker crossing it with no rest spot along its own way (motion-core doorShutting, shutBlocked)", async () => {
  const { doorShutting, shutBlocked, spotsAlong } = await import("../motion-core.mjs");
  // Only an open door going to shut (Foundry: ds 0 CLOSED, 1 OPEN, 2 LOCKED); a wall that does not block movement never.
  assert.equal(doorShutting({ door: 1, ds: 1, move: 20 }, { ds: 0 }), true);
  assert.equal(doorShutting({ door: 2, ds: 1, move: 20 }, { ds: 2 }), true, "a secret door locked");
  assert.equal(doorShutting({ door: 1, ds: 0, move: 20 }, { ds: 2 }), false, "already shut");
  assert.equal(doorShutting({ door: 1, ds: 0, move: 20 }, { ds: 1 }), false, "opened");
  assert.equal(doorShutting({ door: 0, ds: 0, move: 20 }, { ds: 0 }), false, "not a door");
  assert.equal(doorShutting({ door: 1, ds: 1, move: 0 }, { ds: 0 }), false, "blocks no movement");
  assert.equal(doorShutting({ door: 1, ds: 1, move: 20 }, { light: 20 }), false, "no door state change");
  // A one-wide corridor along y = 1, a door's line at x = 6. "w" walks east and is drawn in the doorway (5.9); behind it
  // "r" rests at 4.9. With the door shut ahead, w can only back off, into r: nowhere to rest.
  const door = x => (a, b) => (a.x < x) !== (b.x < x);
  const across = p => Math.abs(p.x - 6) < 0.5 - 1e-6;
  const rest = [{ x: 4.9, y: 1, r: 0.5 }];
  const inside = p => rest.some(c => Math.hypot(p.x - c.x, p.y - c.y) < 1 - 0.01);
  const item = (id, x, { free = p => !across(p) && !inside(p) } = {}) => ({ id, r: 0.5, drawn: { x, y: 1 },
    cands: spotsAlong({ drawn: { x, y: 1 }, ahead: [{ x: 9, y: 1 }], behind: [{ x: 0, y: 1 }], free, wallBetween: door(6),
      enters: (f, p) => inside(p) && !inside(f), step: 0.05, aheadMax: 1.5, behindMax: Infinity }) });
  assert.equal(shutBlocked([item("w", 5.9)]), "w", "in the doorway with nowhere to back off");
  // The same with room behind (r gone): it backs off clear of the door's line, the shut goes.
  rest.length = 0;
  assert.equal(shutBlocked([item("w", 5.9)]), null);
  // Nobody crossing: nothing to refuse.
  assert.equal(shutBlocked([]), null);
  // Two crossing, each with only one spot and the two inside each other: the first named (the nearest the door).
  const one = (id, x) => ({ id, r: 0.5, drawn: { x, y: 1 }, cands: [{ p: { x, y: 1 }, via: [] }] });
  assert.equal(shutBlocked([one("a", 5.2), one("b", 4.6)]), "a");
  assert.equal(shutBlocked([one("a", 5.2), one("b", 3.6)]), null, "apart: both rest where drawn");
});
