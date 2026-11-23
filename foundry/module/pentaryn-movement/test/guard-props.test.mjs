// Randomized property tests for the runtime yield guard (guard-core.mjs, 0.7.0 stage 3), seeded so a failure
// reproduces (the seed is in the message). Each scenario is a room with tokens standing about and 2-6 movers, each
// with its own place in the server's order, walking random ways that cross each other and run through standing
// tokens and each other's ends: the planners' misses the guard exists for. The guard runs as the glue runs it (every
// GUARD.everyMs out of combat; every frame in a fight, where a yield withholds the next square), and:
//   - no overlap: at every 5 ms sample, no mover comes inside touching by more than GUARD.tol (+ the sampling slack)
//     of a standing token or of another mover (in a fight, a move's first square is the drop's own, sent with the
//     move: a pair met inside it is the planner's until it is apart again);
//   - a mover only ever gives way to a standing token, to an earlier mover, or (in a fight) to a square already under
//     way, which core cannot stop; never to a later mover's way;
//   - liveness: every mover is at rest (at its end, or rested by the 8 s rule) within a bounded time;
//   - in a fight every mover rests on a whole square, and the squares it pays for are the squares it walked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUARD, cellHorizon, comparePriority, conflictAhead, lengthOf, newYield, segmentDistance, standingOnRoute, stepYield, yieldsTo } from "../guard-core.mjs";

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

const SEEDS = Number(process.env.GUARD_SEEDS ?? 200);
const W = 14, H = 10;
const SLACK = 0.03;              // squares: sampling between two of the guard's 15 ms samples
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Circles placed at random, none overlapping (touching allowed). */
function place(rand, n, taken, { cell = false, rOf = () => 0.5 } = {}) {
  const out = [];
  for (let tries = 0; out.length < n && tries < 400; tries++) {
    const r = rOf();
    const c = cell
      ? { x: Math.floor(1 + rand() * (W - 2)) + 0.5, y: Math.floor(1 + rand() * (H - 2)) + 0.5 }
      : { x: r + rand() * (W - 2 * r), y: r + rand() * (H - 2 * r) };
    if ([...taken, ...out].some(o => d(o, c) < o.r + r)) continue;
    out.push({ ...c, r });
  }
  return out;
}

/** Where a walk along `pts` is after `len` squares, and what is left of it. */
function walk(pts, len) {
  let left = len;
  for (let k = 1; k < pts.length; k++) {
    const L = d(pts[k - 1], pts[k]);
    if (left < L) {
      const f = left / L;
      const p = { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f };
      return [p, ...pts.slice(k)];
    }
    left -= L;
  }
  return [pts.at(-1)];
}

/**
 * One scenario. Out of combat: free ways, the guard every 50 ms, a pause stops the mover where it is. In a fight:
 * ways of whole squares (8-neighbour steps), the guard every 16 ms frame, a pause lets the mover finish its square and
 * withholds the next. Returns the measures the properties read.
 */
function scenario(seed, { combat = false, trace = null } = {}) {
  const rand = rng(seed);
  const n = 2 + Math.floor(rand() * 5);
  const big = () => (rand() < 0.15 ? 1 : 0.5);
  const starts = place(rand, n, [], { cell: combat, rOf: combat ? () => 0.5 : big });
  const standing = place(rand, Math.floor(rand() * 7), starts, { cell: combat }).map((s, i) => ({ ...s, id: `s${i}` }));
  const order = starts.map((_, i) => i).sort(() => rand() - 0.5);
  const doorways = new Set();
  if (combat) for (let k = 0; k < 3; k++) doorways.add(`${Math.floor(1 + rand() * (W - 2))},${Math.floor(1 + rand() * (H - 2))}`);
  const agents = starts.map((s, i) => {
    const pts = [{ x: s.x, y: s.y }];
    if (combat) {
      let c = { ...pts[0] };
      const steps = 3 + Math.floor(rand() * 9);
      const goal = { x: Math.floor(1 + rand() * (W - 2)) + 0.5, y: Math.floor(1 + rand() * (H - 2)) + 0.5 };
      for (let k = 0; k < steps; k++) {
        const nx = c.x + Math.sign(goal.x - c.x + (rand() - 0.5)), ny = c.y + Math.sign(goal.y - c.y + (rand() - 0.5));
        const q = { x: Math.min(Math.max(nx, 0.5), W - 0.5), y: Math.min(Math.max(ny, 0.5), H - 0.5) };
        if (q.x === c.x && q.y === c.y) continue;
        pts.push(q);
        c = q;
      }
    } else {
      const legs = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < legs; k++) pts.push({ x: s.r + rand() * (W - 2 * s.r), y: s.r + rand() * (H - 2 * s.r) });
    }
    // In a fight the first square is the drop's (core sends it; the guard withholds only the ones after it): the planner
    // keeps it clear, so the scenario does too.
    if (combat && pts.length >= 2) {
      const sweep = o => segmentDistance(o, pts[0], pts[1]) < o.r + s.r - GUARD.tol;
      if (standing.some(sweep) || starts.some((o, j) => j !== i && sweep(o))) pts.length = 1;
    }
    return {
      id: `a${i}`, r: s.r, pos: { x: s.x, y: s.y }, way: pts, left: pts, speed: combat ? 6 : 4 + rand() * 3,
      delay: Math.floor(rand() * 9) * 150, prio: { ord: order[i] + 1, k: 0, id: `a${i}` },
      y: newYield(), started: false, walking: false, done: false, held: false, seg: null, cells: 0, stopAfter: false,
    };
  });
  const out = { worst: 0, worstPair: null, wrongYield: 0, late: 0, firings: 0, restAt: [], offCell: 0, costOff: 0, heldInDoor: 0, n };
  const bound = 1200 + Math.max(...agents.map(a => lengthOf(a.way) / a.speed * 1000)) * 2 + GUARD.restMs + 1000;
  const standingNow = a => !a.walking || (combat && !a.seg);
  const view = (me, t, { resuming = false } = {}) => {
    const others = [];
    for (const o of agents) {
      if (o.id === me.id) continue;
      const moving = o.walking && (combat ? !!o.seg : o.left.length >= 2);
      // In a fight one that has paused (its next square withheld) stands where its square ends: everyone yields to it.
      const paused = combat && moving && (o.held || o.stopAfter);
      const pts = paused ? [o.pos, o.seg.to] : moving ? (combat ? [o.pos, ...o.left.slice(1)] : o.left) : null;
      const e = { id: o.id, c: o.pos, r: o.r, points: pts, speed: o.speed, delay: 0, standing: !moving || paused, prio: o.prio };
      e.yieldTo = yieldsTo(me, e);
      // A yield that goes on again starts afresh: it waits for every mover's way, and in a fight for the way of an
      // earlier paused one (that one goes first: of two held, only one sets off at a time).
      if (resuming && moving && !paused) e.yieldTo = true;
      if (resuming && combat && o.held && !o.done && comparePriority(o.prio, me.prio) < 0 && o.left.length >= 2) {
        others.push({ id: o.id, c: o.pos, r: o.r, points: [o.pos, ...o.left.slice(1)], speed: o.speed, delay: 0, standing: false, prio: o.prio, yieldTo: true });
      }
      others.push(e);
      // Its square under way is committed (core cannot stop it inside a square): nobody walks or stands in it.
      if (moving && combat && !paused) others.push({ ...e, points: [o.pos, o.seg.to], yieldTo: true, committed: true });
      // Not set off yet: its reservation (a delayed walk) as well as where it stands.
      if (!o.started) {
        const r = { id: o.id, c: o.way[0], r: o.r, points: o.way, speed: o.speed, delay: o.delay - t, standing: false, prio: o.prio };
        r.yieldTo = yieldsTo(me, r);
        others.push(r);
      }
    }
    for (const s of standing) others.push({ id: s.id, c: s, r: s.r, points: null, standing: true, yieldTo: true });
    return others;
  };
  const circlesStanding = me => [...agents.filter(o => o !== me && standingNow(o)).map(o => ({ id: o.id, x: o.pos.x, y: o.pos.y, r: o.r })), ...standing];
  const wayAhead = a => (combat ? (a.seg ? [a.pos, ...a.left.slice(1)] : a.left) : a.left);
  const horizon = a => {
    if (!combat) return GUARD.horizonMs;
    const segLeft = a.seg ? d(a.pos, a.seg.to) : 0;
    const from = a.seg ? a.seg.to : a.pos;
    const rest = a.seg ? a.left.slice(2) : a.left.slice(1);
    const next = [];
    let prev = from;
    for (const p of rest.slice(0, 2)) { next.push(d(prev, p)); prev = p; }
    const door = rest[0] ? doorways.has(`${Math.floor(rest[0].x)},${Math.floor(rest[0].y)}`) : false;
    return cellHorizon(a.speed, segLeft, next, { doorway: door });
  };
  const guard = t => {
    let again = true;
    for (let round = 0; again && round < 6; round++) {
      again = false;
      for (const a of agents) {
        if (!a.started || a.done) continue;
        const me = { id: a.id, c: a.pos, r: a.r, speed: a.speed, prio: a.prio };
        if (a.y.phase === "walk") {
          if (!a.walking) continue;
          if (combat && a.left.length < 2 && !a.seg) continue;
          if (combat && !(a.seg && a.left.length >= 2) && !(a.left.length >= 2)) continue;
          if (combat && a.left.length < 2) continue;                 // its last square: nothing to withhold
          me.points = wayAhead(a);
          const hz = horizon(a);
          const hit = conflictAhead(me, view(me, t), { horizonMs: hz });
          if (!hit) continue;
          if (combat && a.seg && hit.t < d(a.pos, a.seg.to) / a.speed * 1000) out.late += 1;
          const blocker = agents.find(o => o.id === hit.id);
          const committed = view(me, t).some(o => o.committed && o.id === hit.id);
          if (blocker && !hit.standing && !committed && comparePriority(blocker.prio, a.prio) > 0) out.wrongYield += 1;
          out.firings += 1;
          const act = stepYield(a.y, { now: t, conflict: true });
          trace?.push([t, a.id, act, hit.id, Math.round(hit.t), a.pos, a.seg?.to ?? null]);
          if (act === "pause") { a.held = true; if (!combat) a.walking = false; again = true; }
          else if (act === "rest") { a.done = true; if (combat && a.seg) a.stopAfter = true; else a.walking = false; out.restAt.push(t); again = true; }
          continue;
        }
        if (a.y.phase !== "held") continue;
        const pts = combat ? (a.seg ? [a.pos, ...a.left.slice(1)] : a.left) : a.left;
        me.points = pts.length >= 2 ? pts : null;
        const hit = me.points ? conflictAhead(me, view(me, t, { resuming: true }), { horizonMs: horizon(a) }) : null;
        const blocked = me.points ? standingOnRoute(me.points, a.r, circlesStanding(a)) : null;
        const act = stepYield(a.y, { now: t, clear: !hit && !blocked });
        if (act) trace?.push([t, a.id, act, hit?.id ?? blocked?.id ?? null, a.pos]);
        // A re-route here finds no way round (the glue's search is not modelled): it waits on, and rests at 8 s.
        if (act === "reroute") a.y.phase = "held";
        else if (act === "resume") { a.held = false; a.walking = true; }
        else if (act === "rest") { a.done = true; a.held = false; if (combat && a.seg) a.stopAfter = true; else a.walking = false; out.restAt.push(t); }
      }
    }
  };
  const step = (t, dt) => {
    for (const a of agents) {
      if (!a.started && t >= a.delay) { a.started = true; a.walking = a.way.length >= 2; }
      if (!a.walking) continue;
      if (!combat) {
        a.left = walk(a.left, (a.speed * dt) / 1000);
        a.pos = a.left[0];
        if (a.left.length < 2) a.walking = false;
        continue;
      }
      // A fight: a square at a time; at its end, the next only if not held (core's continuation withheld).
      if (!a.seg) {
        if (a.held || a.done || a.left.length < 2) { if (a.left.length < 2 || a.done) a.walking = false; continue; }
        a.seg = { from: a.left[0], to: a.left[1] };
        trace?.push([t, a.id, "seg", a.seg.from, a.seg.to]);
      }
      const before = d(a.pos, a.seg.to);
      const go = (a.speed * dt) / 1000;
      if (go >= before) {
        a.pos = { ...a.seg.to };
        a.left = a.left.slice(1);
        a.seg = null;
        a.cells += 1;
        if (a.stopAfter) { a.walking = false; a.stopAfter = false; }
      } else {
        const f = go / before;
        a.pos = { x: a.pos.x + (a.seg.to.x - a.pos.x) * f, y: a.pos.y + (a.seg.to.y - a.pos.y) * f };
      }
    }
  };
  const every = combat ? 16 : GUARD.everyMs;
  let lastGuard = -Infinity;
  const seenStart = new Set();
  const tainted = new Set();
  for (let t = 0; t <= bound; t += 5) {
    const newly = agents.some(a => !seenStart.has(a.id) && t >= a.delay);
    step(t, 5);
    for (const a of agents) if (a.started) seenStart.add(a.id);
    if (newly || t - lastGuard >= every) { guard(t); lastGuard = t; }
    // No overlap: every mover against every standing token and every other token. In a fight a move's first square is
    // the drop's own (core sends it with the move; stages 1-2 keep it clear): a pair one of which walks it is the
    // planner's, not the guard's.
    // A pair that came inside touching that way stays the planner's until it is apart again.
    const first = a => combat && a.seg && a.cells === 0;
    const judge = (key, pen, committed, pair) => {
      if (pen <= GUARD.tol) { tainted.delete(key); return; }
      if (committed) tainted.add(key);
      if (tainted.has(key)) return;
      if (pen > out.worst) { out.worst = pen; out.worstPair = pair; }
    };
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      for (const s of standing) judge(`${a.id}|${s.id}`, a.r + s.r - d(a.pos, s), first(a), [a.id, s.id, t]);
      for (let j = i + 1; j < agents.length; j++) {
        const b = agents[j];
        judge(`${a.id}|${b.id}`, a.r + b.r - d(a.pos, b.pos), first(a) || first(b), [a.id, b.id, t]);
      }
    }
    if (agents.every(a => a.started && !a.walking)) { out.end = t; break; }
  }
  out.bound = bound;
  out.agents = agents;
  out.allRest = agents.every(a => a.started && !a.walking);
  if (combat) {
    for (const a of agents) {
      const onCell = Math.abs(a.pos.x - Math.floor(a.pos.x) - 0.5) < 1e-6 && Math.abs(a.pos.y - Math.floor(a.pos.y) - 0.5) < 1e-6;
      if (!onCell) out.offCell += 1;
      // The squares it pays for: one per step taken, each from a whole square to the next.
      const walked = a.way.length - a.left.length;
      if (walked !== a.cells) out.costOff += 1;
    }
  }
  return out;
}

for (const combat of [false, true]) {
  const name = combat ? "in a fight" : "out of combat";
  test(`no overlap ${name}: no mover comes inside touching by more than GUARD.tol of anything, at any 5 ms sample (${SEEDS} seeds)`, () => {
    let fired = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = scenario(seed * (combat ? 7919 : 104729), { combat });
      fired += r.firings;
      assert.ok(r.worst <= GUARD.tol + SLACK, `seed ${seed}: ${r.worst.toFixed(3)} squares inside touching (${r.worstPair})`);
    }
    assert.ok(fired > SEEDS / 2, `the scenarios do make the guard fire (${fired})`);
  });

  test(`a mover gives way only to a standing token or an earlier mover ${name} (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = scenario(seed * (combat ? 7919 : 104729), { combat });
      assert.equal(r.wrongYield, 0, `seed ${seed}`);
    }
  });

  test(`liveness ${name}: every mover is at rest within its bound, and nothing waits past GUARD.restMs from its first yield (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = scenario(seed * (combat ? 7919 : 104729), { combat });
      assert.ok(r.allRest, `seed ${seed}: someone still walking or waiting at ${r.bound} ms`);
      assert.ok(r.end <= r.bound, `seed ${seed}`);
    }
  });
}

test(`in a fight every mover rests on a whole square and pays for exactly the squares it walked (${SEEDS} seeds)`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = scenario(seed * 7919, { combat: true });
    assert.equal(r.offCell, 0, `seed ${seed}`);
    assert.equal(r.costOff, 0, `seed ${seed}`);
  }
});
