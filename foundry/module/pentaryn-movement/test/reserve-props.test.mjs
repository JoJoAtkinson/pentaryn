// Randomized property tests for the server-ordered reservations (reserve-core.mjs with the pure planner, 0.6.0
// stage 2), seeded so a failure reproduces (the seed is in the message). Two groups on a random ASCII floor routed
// with the real pathfind-core A* (test/fixtures/grid.mjs), with tokens standing about:
//   - a later plan that reads an earlier one's reservation (part way through it, its later waves still to go) never
//     comes closer than touching to it, to a standing token or to its own members, at any sampled time;
//   - two plans made at the same instant: the later in the server's order detects the race whenever the two would
//     meet (no false negative against exact sampling), and its re-plan round the earlier one never meets it;
//   - a single drag waits, or is cut, so that it never meets a reserved walk;
//   - liveness: every plan finishes inside its budget, every member is at rest within a bounded time, a queue never
//     waits longer than RESERVE.queueMs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member } from "./fixtures/grid.mjs";
import { GROUP_LIMITS, planGroup } from "../group-core.mjs";
import { MOTION, delayed, dist, positionAt, trajectory } from "../motion-core.mjs";
import { RESERVE, encode, lostRace, moved, queueUntil, receive, registry, restsOf, singleCut, singleTiming, walkersOf } from "../reserve-core.mjs";

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

/** A walled W×H floor with pillars and, sometimes, a full wall with one or two doors (one-wide gaps). */
function randomMap(rand, W = 18, H = 11) {
  const rows = [];
  for (let i = 0; i < H; i++) {
    let row = "";
    for (let j = 0; j < W; j++) row += (i === 0 || j === 0 || i === H - 1 || j === W - 1 || rand() < 0.1) ? "#" : ".";
    rows.push(row);
  }
  if (rand() < 0.6) {
    const col = 5 + Math.floor(rand() * (W - 10));
    const doors = new Set([1 + Math.floor(rand() * (H - 2)), 1 + Math.floor(rand() * (H - 2))]);
    for (let i = 1; i < H - 1; i++) rows[i] = rows[i].slice(0, col) + (doors.has(i) ? "." : "#") + rows[i].slice(col + 1);
  }
  return rows.join("\n");
}

/** Two groups (A earlier, B later), standing tokens, in or out of a fight; B sometimes to A's own spot, sometimes the other way. */
function scenario(seed) {
  const rand = rng(seed);
  const ascii = randomMap(rand);
  const g = gridWorld(ascii);
  const cells = [];
  g.rows.forEach((r, i) => [...r].forEach((c, j) => { if (c !== "#") cells.push({ x: j + 0.5, y: i + 0.5 }); }));
  const pool = [...cells];
  const take = () => pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const groupOf = (tag, n, target) => {
    const raw = [];
    for (let k = 0; k < n && pool.length; k++) raw.push({ id: `${tag}${k}`, p: take() });
    const anchorId = raw[0].id;
    const delta = { x: target.x - raw[0].p.x, y: target.y - raw[0].p.y };
    return { anchorId, ms: raw.map(m => member(m.id, m.p, delta)) };
  };
  const tA = cells[Math.floor(rand() * cells.length)];
  const A = groupOf("a", 2 + Math.floor(rand() * 3), tA);
  const mode = rand();
  // B: to the same spot (the second group), back towards A's starts (head-on), or anywhere.
  const tB = mode < 0.3 ? tA : mode < 0.6 ? A.ms[0].start : cells[Math.floor(rand() * cells.length)];
  const B = groupOf("b", 2 + Math.floor(rand() * 3), tB);
  const others = [];
  for (let k = 0; k < 4 && pool.length; k++) if (rand() < 0.6) { const c = take(); others.push({ id: `o${k}`, x: c.x, y: c.y, r: 0.5 }); }
  return { seed, ascii, g, A, B, others, combat: rand() < 0.2, lag: Math.floor(rand() * 1500) };
}

const oracles = (g, anchor) => ({ walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route,
  toward: (m, f, t) => g.route(m, f, t), narrow: g.narrow, cramped: g.cramped, now: () => 0 });

function run(gen) {
  let s, steps = 0;
  const t0 = Date.now();
  do { s = gen.next(); steps += 1; } while (!s.done && steps < 200000);
  assert.ok(s.done, "the plan finished");
  return { plan: s.value, ms: Date.now() - t0 };
}

function plan(grp, { others = [], moving = [], reserved = [], combat = false }) {
  const anchor = grp.ms.find(m => m.id === grp.anchorId);
  return run(planGroup({ members: grp.ms, anchorId: grp.anchorId, combat, others, moving, reserved }, oracles(grpWorld.g, anchor)));
}
let grpWorld = null;

/** A plan's walks as reserve.mjs reserves them (walksOf). */
const walksOf = (grp, p) => grp.ms.map(m => ({ m, e: p.members[m.id] })).filter(({ e }) => e && !e.core && e.points?.length >= 2)
  .map(({ m, e }) => ({ id: m.id, r: m.r, speed: m.speed, delay: e.delay ?? 0, points: e.points }));
const startsOf = grp => grp.ms.map(m => ({ id: m.id, x: m.start.x, y: m.start.y, r: m.r }));
/** Every member's trajectory, `shift` ms later on the shared clock (its plan's wave 0 at `shift`). */
const trajOf = (grp, p, shift = 0) => grp.ms.map(m => {
  const e = p.members[m.id];
  const pts = e?.points?.length ? e.points : [m.start];
  return { id: m.id, r: m.r, T: delayed(trajectory(pts, { speed: m.speed }), (e?.delay ?? 0) + shift) };
});
/** The floor two circles keep: touching, or (one that starts closer) no closer than it started, less MOTION.contact. */
function floorFor(A, B, rr, t0 = 0) {
  const d0 = dist(positionAt(A, t0), positionAt(B, t0));
  return (d0 < rr + 0.05 ? Math.min(d0, rr) - MOTION.contact : rr) - 1e-6;
}
/** The closest two trajectories come from t0 on, sampled every 10 ms: { t, d, floor } of the worst, or null. */
function worst(A, B, rr, t0 = 0) {
  const floor = floorFor(A, B, rr, t0);
  let bad = null;
  for (let t = t0; t <= Math.max(A.end, B.end) + 20; t += 10) {
    const d = dist(positionAt(A, t), positionAt(B, t));
    if (d < floor && (!bad || d < bad.d)) bad = { t, d, floor };
  }
  return bad;
}
const still = T => T.end <= T.start + 1e-6;

const SEEDS = Array.from({ length: 200 }, (_, k) => 9000 + k);

test("property (0.6.0): a later plan that reads an earlier reservation, part way through it, never meets it, a standing token or its own members", () => {
  let pairs = 0, reserved = 0;
  for (const seed of SEEDS) {
    const sc = scenario(seed);
    grpWorld = sc;
    // A planned first, round the standing tokens and B standing at its starts.
    const a = plan(sc.A, { others: [...sc.others, ...startsOf(sc.B)], combat: sc.combat }).plan;
    if (a.result !== "plan") continue;
    const reg = registry();
    const aWalks = walksOf(sc.A, a);
    if (!aWalks.length) continue;
    receive(reg, encode({ rid: "A", scene: "S", combat: sc.combat, members: aWalks }), { now: 0 });
    // Its wave 0 sets off at 100 ms (the clock of the whole reservation); each later wave on time, until B plans.
    const now = 100 + sc.lag;
    for (const w of aWalks) if (100 + w.delay <= now) moved(reg, w.id, { rid: "A", movementId: `M${w.id}`, now: 100 + w.delay });
    // B planned `lag` ms later, reading the registry; A's members where the server has them then.
    const aT = trajOf(sc.A, a, 100 - now);
    const where = aT.map(x => {
      const set = x.T.start <= 0;
      return { id: x.id, r: x.r, ...(set ? (sc.combat ? positionAt(x.T, 0) : x.T.pts.at(-1)) : x.T.pts[0]) };
    });
    const walkers = walkersOf(reg, { now, scene: "S" });
    const rests = restsOf(reg, { now, scene: "S" });
    reserved += 1;
    const b = plan(sc.B, { others: [...sc.others, ...where], moving: walkers, reserved: rests, combat: sc.combat }).plan;
    if (b.result !== "plan") continue;
    const bT = trajOf(sc.B, b, 0);
    for (const x of bT) {
      for (const y of aT) {
        if (still(x.T) && !still(y.T)) continue;              // standing still: the walker's own planner answered (A, round B's starts)
        const hit = worst(x.T, y.T, x.r + y.r);
        assert.equal(hit, null, `seed ${seed}: ${x.id} meets reserved ${y.id} ${JSON.stringify(hit)} (lag ${sc.lag}, combat ${sc.combat})\n${sc.ascii}`);
        pairs += 1;
      }
      for (const o of sc.others) {
        const hit = worst(x.T, trajectory([o]), x.r + o.r);
        assert.equal(hit, null, `seed ${seed}: ${x.id} meets standing ${o.id} ${JSON.stringify(hit)}\n${sc.ascii}`);
      }
      for (const y of bT) {
        if (y.id <= x.id) continue;
        const hit = worst(x.T, y.T, x.r + y.r);
        assert.equal(hit, null, `seed ${seed}: ${x.id}/${y.id} ${JSON.stringify(hit)}\n${sc.ascii}`);
      }
    }
  }
  assert.ok(reserved > 120, `only ${reserved} scenarios with a reservation`);
  assert.ok(pairs > 600, `only ${pairs} pairs checked`);
});

test("property (0.6.0): a same-instant race — the later in server order sees every meeting (no false negative) and its re-plan never meets the earlier", () => {
  let raced = 0, clean = 0;
  for (const seed of SEEDS) {
    const sc = scenario(seed + 100000);
    grpWorld = sc;
    // Neither reads the other: each sees the other standing at its starts.
    const a = plan(sc.A, { others: [...sc.others, ...startsOf(sc.B)], combat: sc.combat }).plan;
    const b = plan(sc.B, { others: [...sc.others, ...startsOf(sc.A)], combat: sc.combat }).plan;
    if (a.result !== "plan" || b.result !== "plan") continue;
    const aWalks = walksOf(sc.A, a), bWalks = walksOf(sc.B, b);
    if (!aWalks.length || !bWalks.length) continue;
    // A first in the server's order; both set off at t = 0 (B at its echo, one round trip later: modelled as 0, the worst).
    const reg = registry();
    receive(reg, encode({ rid: "A", scene: "S", combat: sc.combat, members: aWalks }), { now: 0 });
    moved(reg, aWalks[0].id, { rid: "A", movementId: "M", now: aWalks[0].delay });
    const theirs = walkersOf(reg, { now: 0, scene: "S" });
    const lost = lostRace(bWalks, theirs, { combat: sc.combat });
    const aT = trajOf(sc.A, a, 0);
    if (!lost) {
      // No false negative: B's own plan, as it is, meets no walk of A's.
      for (const x of trajOf(sc.B, b, 0)) for (const y of aT) {
        if (still(x.T) || still(y.T)) continue;
        const hit = worst(x.T, y.T, x.r + y.r);
        assert.equal(hit, null, `seed ${seed}: not raced, but ${x.id} meets ${y.id} ${JSON.stringify(hit)}\n${sc.ascii}`);
      }
      clean += 1;
      continue;
    }
    raced += 1;
    // The re-plan: B reads A's reservation (A walking since t = 0) and A's members where the server has them now.
    const where = aT.map(x => ({ id: x.id, r: x.r, ...(x.T.start <= 0 ? (sc.combat ? positionAt(x.T, 0) : x.T.pts.at(-1)) : x.T.pts[0]) }));
    const b2 = plan(sc.B, { others: [...sc.others, ...where], moving: theirs, reserved: restsOf(reg, { now: 0, scene: "S" }), combat: sc.combat }).plan;
    if (b2.result !== "plan") continue;
    for (const x of trajOf(sc.B, b2, 0)) for (const y of aT) {
      if (still(x.T) && !still(y.T)) continue;
      const hit = worst(x.T, y.T, x.r + y.r);
      assert.equal(hit, null, `seed ${seed}: re-planned ${x.id} meets ${y.id} ${JSON.stringify(hit)}\n${sc.ascii}`);
    }
  }
  assert.ok(raced > 20, `only ${raced} races`);
  assert.ok(clean > 20, `only ${clean} clean pairs`);
});

test("property (0.6.0): a single drag waits for, or is cut before, every reserved walk it would meet", () => {
  let waited = 0, cut = 0;
  for (const seed of SEEDS) {
    const sc = scenario(seed + 200000);
    grpWorld = sc;
    const a = plan(sc.A, { others: [...sc.others, ...startsOf(sc.B)], combat: sc.combat }).plan;
    if (a.result !== "plan") continue;
    const walkers = walksOf(sc.A, a);
    const m = sc.B.ms[0];
    const r = sc.g.route(m, m.start, m.formation, { avoid: [] });
    if (!r?.points || r.points.length < 2) continue;
    const me = { id: m.id, r: m.r, speed: m.speed, points: r.points };
    const t = singleTiming(me, walkers, { combat: sc.combat });
    let T;
    if (t.delay !== null) {
      assert.ok(t.delay >= 0 && t.delay <= RESERVE.singleMs && t.delay % MOTION.delayStep === 0, `seed ${seed}: delay ${t.delay}`);
      if (t.delay > 0) waited += 1;
      T = delayed(trajectory(me.points, { speed: me.speed }), t.delay);
    } else {
      assert.ok(t.until > 0 && t.until <= RESERVE.queueMs, `seed ${seed}: queue ${t.until}`);
      const c = singleCut(me, walkers, { combat: sc.combat });
      cut += 1;
      T = trajectory(c.still ? [m.start] : c.points, { speed: me.speed });
      if (still(T)) continue;
    }
    for (const y of trajOf(sc.A, a, 0)) {
      if (still(y.T)) continue;                                 // a member that stays is a standing token: the route's (stage 1)
      const hit = worst(T, y.T, m.r + y.r);
      assert.equal(hit, null, `seed ${seed}: single meets ${y.id} ${JSON.stringify(hit)}\n${sc.ascii}`);
    }
  }
  assert.ok(waited > 3, `only ${waited} waits`);
  assert.ok(cut + waited > 5);
});

test("property (0.6.0): liveness — every plan reading reservations finishes in budget; every member rests in bounded time; queues are capped", () => {
  for (const seed of SEEDS) {
    const sc = scenario(seed + 300000);
    grpWorld = sc;
    const a = plan(sc.A, { others: [...sc.others, ...startsOf(sc.B)], combat: sc.combat });
    if (a.plan.result !== "plan") continue;
    const aWalks = walksOf(sc.A, a.plan);
    const reg = registry();
    receive(reg, encode({ rid: "A", scene: "S", members: aWalks }), { now: 0 });
    const walkers = walkersOf(reg, { now: 0 });
    const b = plan(sc.B, { others: [...sc.others, ...startsOf(sc.A)], moving: walkers, reserved: restsOf(reg, { now: 0 }), combat: sc.combat });
    assert.ok(b.ms < GROUP_LIMITS.totalMs, `seed ${seed}: ${b.ms} ms`);
    if (b.plan.result !== "plan") continue;
    assert.equal(Object.keys(b.plan.members).length, sc.B.ms.length, `seed ${seed}: every member has an entry`);
    for (const x of trajOf(sc.B, b.plan, 0)) {
      assert.ok(Number.isFinite(x.T.end) && x.T.end <= 4 * MOTION.maxDelay + 20000, `seed ${seed}: ${x.id} at rest only after ${Math.round(x.T.end)} ms`);
    }
    const short = walksOf(sc.B, b.plan);
    const u = queueUntil(short, walkers, { combat: sc.combat });
    assert.ok(u === null || (u > 0 && u <= RESERVE.queueMs), `seed ${seed}: queue ${u}`);
  }
});
