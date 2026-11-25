// 0.10.2, no page freeze: a group plan run in slices (planLeadSteps, walkForSteps, routes that yield) is the plan run
// at once. Pinned on the simulator's seeds (every drop's plan made again in slices of random sizes), on generated
// spiral stairs (the narrow walk and a march over the C) and on the door plug's maps (a door, a thin wall, a mouth).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSeed } from "./sim/scenario.mjs";
import { PLAN_CHECK } from "./sim/model.mjs";
import { planLead, planLeadSteps } from "../file-core.mjs";
import { drain, walkFor, walkForSteps } from "../narrow-core.mjs";
import { cStair, router, rng } from "./fixtures/narrow.mjs";
import { gridWorld } from "./fixtures/grid.mjs";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Drive a generator to its end in slices of `size(k)` steps; returns { value, slices, leads }. */
function sliced(gen, size) {
  let r = { done: false }, k = 0, leads = 0;
  while (!r.done) { const n = size(k++); for (let i = 0; i < n && !r.done; i++) { r = gen.next(); if (!r.done && r.value?.lead) leads += 1; } }
  return { value: r.value, slices: k, leads };
}

test("0.10.2: on 160 simulator seeds every drop's plan made in slices (random sizes, routes that yield) is the plan made at once", () => {
  const R = rng(20261125);
  let plans = 0, slices = 0, leads = 0;
  PLAN_CHECK.slice = () => 1 + Math.floor(R() * 5);
  PLAN_CHECK.on = (a, b, info) => {
    plans += 1; slices += info.slices; leads += info.leads;
    assert.deepEqual(b, a, `plan ${plans}: the sliced plan differs`);
  };
  try {
    for (let s = 1; s <= 160; s++) runSeed(s);
  } finally { PLAN_CHECK.on = null; PLAN_CHECK.slice = () => 1; }
  assert.ok(plans > 80, `plans checked: ${plans} (the out-of-combat drops)`);
  assert.ok(slices > plans * 3, `in slices: ${slices} for ${plans} plans`);
  assert.ok(leads > plans * 0.5, `the leader known mid-plan: ${leads} of ${plans}`);
});

test("0.10.2: the narrow walk in slices (walkForSteps, yielding inside the band) is walkFor on 20 generated C stairs, both ways", () => {
  let yields = 0, routes = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const C = cStair(seed);
    const R = router(C.walls);
    const a = C.pick(C.rooms[0]), b = C.pick(C.rooms[1]);
    for (const [from, to] of [[a, b], [b, a]]) {
      const r = R.route(from, to);
      assert.ok(r.found && r.fine, `seed ${seed}: a route over the stair`);
      const nodes = r.path.map(n => ({ I: n.i, J: n.j, c: n.c ?? 0 }));
      const once = walkFor(R.field, nodes, { from, to });
      const gen = walkForSteps(R.field, nodes, { from, to });
      let x = gen.next();
      for (; !x.done; x = gen.next()) yields += 1;
      assert.deepEqual(x.value, once, `seed ${seed}: the same walk`);
      assert.deepEqual(drain(walkForSteps(R.field, nodes, { from, to })), once);
      routes += 1;
    }
  }
  assert.ok(yields > routes * 5, `the band yields as it settles: ${yields} over ${routes} walks`);
});

/** The grid fixture's oracles (plug.test's), the route plain or as a generator that yields between its steps. */
function oracles(g, { gen = false } = {}) {
  const plain = (m, from, to, avoid) => g.route(m, from, to, { avoid: avoid.map(o => ({ x: o.x, y: o.y, r: o.r + m.r - 0.01 })).filter(c => dist(c, from) >= c.r) })?.points ?? null;
  return { walkable: g.walkable, step: g.stepOpen, route: gen ? function* (...a) { yield; yield; return plain(...a); } : plain };
}
const room = (W, H, f) => Array.from({ length: H }, (_, i) => Array.from({ length: W }, (_, j) => f(i, j)).join("")).join("\n");
const MAPS = {
  door: { ascii: room(27, 13, (i, j) => (i === 0 || i === 12 || j === 0 || j === 26 || (j === 9 && i !== 6)) ? "#" : "."), past0: 9 },
  thin: { ascii: room(27, 13, (i, j) => (i === 0 || i === 12 || j === 0 || j === 26) ? "#" : "."), walls: [{ a: { x: 10, y: 1 }, b: { x: 10, y: 6 } }, { a: { x: 10, y: 7 }, b: { x: 10, y: 12 } }], past0: 9 },
  mouth: { ascii: room(32, 13, (i, j) => (i === 0 || i === 12 || j === 0 || j === 31) ? "#" : (j >= 7 && j <= 14 && i !== 6) ? "#" : "."), past0: 14 },
};

test("0.10.2: the door plug's maps (a door, a thin wall, a mouth; one to five squares past, 4 / 8 / 12 members) and a march and a swarm: planLeadSteps in slices is planLead", () => {
  const R = rng(7);
  let n = 0;
  for (const [name, M] of Object.entries(MAPS)) {
    const g = gridWorld(M.ascii, { walls: M.walls ?? [] });
    const free = [];
    g.rows.forEach((r, i) => [...r].forEach((ch, j) => { if (ch !== "#" && j < M.past0) free.push({ i, j }); }));
    for (const size of [4, 8, 12]) for (const past of [1, 2, 3, 4, 5]) {
      const pool = free.filter(c => c.j >= 1).sort((a, b) => (Math.abs(a.i - 6) + (M.past0 - a.j)) - (Math.abs(b.i - 6) + (M.past0 - b.j)) || a.i - b.i || a.j - b.j);
      const members = pool.slice(0, size).map((c, k) => ({ id: `m${k}`, w: 1, h: 1, r: 0.5, start: { x: c.j + 0.5, y: c.i + 0.5 } }));
      const spec = { members, leaderId: "m0", drop: { x: M.past0 + past + 0.5, y: 6.5 }, standing: [] };
      const once = planLead(spec, oracles(g));
      const s = sliced(planLeadSteps(spec, oracles(g, { gen: true })), () => 1 + Math.floor(R() * 4));
      assert.deepEqual(s.value, once, `${name} ${past} past, ${size}: the same plan`);
      assert.ok(s.leads === 1, `${name}: the leader known once (${s.leads})`);
      n += 1;
      // A swarm onto a token standing just inside.
      const T = { id: "T", x: M.past0 + past + 1.5, y: 6.5, w: 1, h: 1 };
      const sw = { ...spec, target: T, standing: [{ id: "T", x: T.x, y: T.y, r: 0.5 }] };
      assert.deepEqual(sliced(planLeadSteps(sw, oracles(g, { gen: true })), () => 2).value, planLead(sw, oracles(g)), `${name} swarm ${past}`);
    }
  }
  assert.equal(n, 45);
});

test("0.10.2: a march of eight over a generated C stair (routes over the narrow way's walk, yielding inside it) is the same plan in slices", () => {
  for (const seed of [3, 11, 19]) {
    const C = cStair(seed);
    const Rt = router(C.walls);
    const A = C.rooms[0], B = C.rooms[1];
    const at = (X, s, d) => ({ x: X.a.x + X.rad.x * s + X.dir.x * d, y: X.a.y + X.rad.y * s + X.dir.y * d });
    const members = [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3]].map(([s, d], k) => ({ id: `h${k}`, w: 1, h: 1, r: 0.5, start: at(A, s, d) }));
    const drop = at(B, 2, 2);
    const walkable = (m, c) => C.walls.every(w => { const [ax, ay, bx, by] = w; const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.y - ay) * dy) / L2)); return Math.hypot(c.x - ax - dx * t, c.y - ay - dy * t) >= 0.45; });
    const step = (a, b) => Rt.wall(a, b);
    let count = 0;
    const plain = (m, from, to, avoid) => { count += 1; const r = Rt.route(from, to); return r.found && !avoid.some(o => r.points.some(p => dist(p, o) < o.r + m.r - 0.05)) ? r.points : null; };
    const once = planLead({ members, leaderId: "h0", drop, standing: [] }, { walkable, step, route: plain });
    const before = count;
    const gen = { walkable, step, route: function* (m, from, to, avoid) { yield; const r = plain(m, from, to, avoid); yield; return r; } };
    const s = sliced(planLeadSteps({ members, leaderId: "h0", drop, standing: [] }, gen), () => 3);
    assert.deepEqual(s.value, once, `stair ${seed}: the same plan`);
    assert.equal(count - before, before, `stair ${seed}: the same searches`);
    assert.ok(once.searches >= 1);
  }
});
