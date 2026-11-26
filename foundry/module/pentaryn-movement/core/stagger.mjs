/**
 * Pentaryn Movement — the start delays of a group drag (0.10 L2, R5; plan context/plans/pathfinding-2026-11.md §18):
 * staggerFile (the leader at once, the pack one wave later, single file only at a narrow point, the last within 4 s of
 * the drop) with its box helpers, narrowZones, and the two circle tests planLead shares (clearOf, routeEnters). Pure,
 * no Foundry globals. Part of the file-core.mjs barrel. Units: centres in grid squares (as motion-core).
 */

import { MOTION, closeTime, delayed, dist, nearestWhile, trajectory } from "../motion-core.mjs";
import { firstIntrusion } from "../group-core.mjs";

const EPS = 1e-6;

/** Squares a route may graze a circle it keeps out of (the search's own one-pixel clearance). */
const SLACK = 0.02;

/** Is `c` (radius r) clear of every circle in `list` ({ x, y, r })? Touching is clear. */
export const clearOf = (c, r, list) => list.every(o => dist(c, o) >= r + o.r - EPS);

/**
 * Does route `points` (radius r) ever come inside one of `circles` after leaving the ones it starts inside? (A circle
 * it starts inside is one it is leaving: a mate's slot on its start, a crowd it was pressed into.)
 */
export function routeEnters(points, r, circles, slack = SLACK) {
  if (!(points?.length >= 2) || !circles?.length) return null;
  // firstIntrusion already leaves out the circles it starts on; `slack`: the route search keeps a pixel's clearance.
  const hit = firstIntrusion(points, r, circles.map(c => ({ ...c, r: Math.max(c.r - slack, 0) })));
  if (!hit) return null;
  const a = points[hit.k], b = points[hit.k + 1];
  return { k: hit.k, t: hit.t, at: { x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t } };
}

/* -------------------------------------------- */
/*  The start delays (0.10 L2, R5)              */
/* -------------------------------------------- */

/**
 * The motion of a group drag out of combat (Joe 2026-11-24; plan §18.2; Fable's review 3 §1 "Motion"). The leader
 * goes in the drop's own update (delay 0); the pack one wave later (150 ms, about one square), or, when the leader
 * starts behind, once it is a wave past the frontmost member (4 s at most). Members wait; they never step aside. One
 * pack on open ground: a pair is held apart only
 *   - at a narrow point (a one-wide square, or the door in a thin wall): one through at a time;
 *   - for a deep, long overlap of the two while both move (two ways merging into one lane);
 *   - when one would walk through the other at rest (still at its start, or already at its slot).
 * The leader is never held, and walks through its own members (R6): no rest check is made against it. Every delay is
 * a multiple of `stepMs`, the last at most `capMs` after the drop (within 4 s of the drop every member is on its way,
 * the one rule); a member that finds no clear delay under the cap goes at the one it meets fewest at (soft), never
 * cut short: its route and slot are planLead's.
 */
export const STAGGER = Object.freeze({
  capMs: 4000,          // the latest start (ms after the drop, the plan's own time off)
  stepMs: MOTION.waveMs,// one wave (one batched update)
  deep: 0.5,            // squares: two movers closer than touching by more than this ...
  longMs: 400,          // ... for longer than this (ms) are a lane, not a crossing
  slack: 0.05,          // squares a mover sent in a later wave may graze a member at rest by (the simulator's)
  brush: 0.15,          // ... and one sent in the same update (MOTION.contact: a brush, never a pass-through)
});

/** Axis-aligned box of a trajectory's points, grown by `pad`. */
function boxOf(pts, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
const boxesMeet = (a, b) => !(a.x0 > b.x1 || b.x0 > a.x1 || a.y0 > b.y1 || b.y0 > a.y1);

/**
 * The narrow points of a floor, from one step between neighbouring squares (`step(a, b)`, walls only; a square (i, j)
 * is row i, column j): a one-wide square (walled on both sides along one axis: a corridor, the gap in a thick wall),
 * and the door in a thin wall (an open step whose two neighbouring steps alongside are walled). Each a 1×1 box.
 * Returns p (squares) → the boxes holding p: [{ key, x, y }] (their centres).
 */
export function narrowZones(step) {
  const open = (a, b) => { try { return !!step(a, b); } catch { return false; } };
  const cells = new Map(), edges = new Map();
  const narrowCell = (i, j) => {
    const k = `${i},${j}`;
    if (!cells.has(k)) {
      const c = { i, j };
      cells.set(k, (!open(c, { i, j: j - 1 }) && !open(c, { i, j: j + 1 })) || (!open(c, { i: i - 1, j }) && !open(c, { i: i + 1, j })));
    }
    return cells.get(k);
  };
  // The step from (i, j) down (di = 1) or right (dj = 1); its neighbours alongside are shifted across it.
  const narrowEdge = (i, j, di, dj) => {
    const k = `${i},${j},${di}`;
    if (!edges.has(k)) {
      const a = { i, j }, b = { i: i + di, j: j + dj };
      const si = dj, sj = di;
      edges.set(k, open(a, b) && !narrowCell(a.i, a.j) && !narrowCell(b.i, b.j)
        && !open({ i: a.i - si, j: a.j - sj }, { i: b.i - si, j: b.j - sj }) && !open({ i: a.i + si, j: a.j + sj }, { i: b.i + si, j: b.j + sj }));
    }
    return edges.get(k);
  };
  return p => {
    const i = Math.floor(p.y), j = Math.floor(p.x);
    const out = [];
    if (narrowCell(i, j)) out.push({ key: `c${i},${j}`, x: j + 0.5, y: i + 0.5 });
    const vi = p.y - i >= 0.5 ? i : i - 1;
    if (narrowEdge(vi, j, 1, 0)) out.push({ key: `v${vi},${j}`, x: j + 0.5, y: vi + 1 });
    const hj = p.x - j >= 0.5 ? j : j - 1;
    if (narrowEdge(i, hj, 0, 1)) out.push({ key: `h${i},${hj}`, x: hj + 1, y: i + 0.5 });
    return out;
  };
}

/** The parameter range [u0, u1] of segment a→b inside the open box of half-size h round c, or null (Liang–Barsky). */
function clipBox(a, b, c, h) {
  let u0 = 0, u1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - (c.x - h)], [dx, c.x + h - a.x], [-dy, a.y - (c.y - h)], [dy, c.y + h - a.y]]) {
    if (Math.abs(p) < 1e-12) { if (q <= 0) return null; continue; }
    const r = q / p;
    if (p < 0) u0 = Math.max(u0, r); else u1 = Math.min(u1, r);
    if (u0 >= u1) return null;
  }
  return [u0, u1];
}

/** When trajectory `tr` is inside each narrow box it passes: Map key → [[t0, t1], …] (ms, its own times). */
function zoneSpans(tr, zonesAt) {
  const out = new Map();
  if (!zonesAt) return out;
  for (let k = 1; k < tr.pts.length; k++) {
    const a = tr.pts[k - 1], b = tr.pts[k], ta = tr.times[k - 1], tb = tr.times[k];
    const n = Math.max(1, Math.ceil(dist(a, b) / 0.2));
    const seen = new Map();
    for (let s = 0; s <= n; s++) for (const z of zonesAt({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n })) seen.set(z.key, z);
    for (const z of seen.values()) {
      const u = clipBox(a, b, z, 0.5);
      if (!u || u[1] - u[0] < 1e-9) continue;
      const iv = [ta + (tb - ta) * u[0], ta + (tb - ta) * u[1]];
      const list = out.get(z.key) ?? [];
      const last = list.at(-1);
      if (last && iv[0] <= last[1] + EPS) last[1] = Math.max(last[1], iv[1]); else list.push(iv);
      out.set(z.key, list);
    }
  }
  return out;
}

/**
 * The start delays of a group drag.
 * @param {{ id: string, r: number, points: {x,y}[], speed?: number, left?: number }[]} walks  the members that move, in
 *        the plan's order (the leader first, then least walk left); centres in squares, speed in squares per second,
 *        left: its walk to the drop (planLead's), which says whether the leader starts behind
 * @param {{ leaderId?: string, step?: (a, b) => boolean, capMs?: number, stepMs?: number, gap?: number, fifo?: boolean }} [o]
 *        leaderId: the leader (delay 0, never held, no rest check against it); step: one step between neighbouring
 *        squares (the narrow points); capMs: the latest start; gap: the latency buffer (squares) between two waves;
 *        fifo: false leaves out the order every screen sees (0.10 L3; only the simulator's regression proof does)
 * @returns {{ delays: Object<string, number>, order: string[], total: number, crowded: string[], pack: number }}
 *          order: the start order (the plan's); total: the largest delay; crowded: the members that found no clear
 *          delay under the cap (they go at the least crowded one); pack: the pack's own start
 */
export function staggerFile(walks, o = {}) {
  const cap = Math.max(0, o.capMs ?? STAGGER.capMs);
  const step = Math.max(1, o.stepMs ?? STAGGER.stepMs);
  const gap = o.gap ?? MOTION.motionGap;
  const capStep = Math.floor(cap / step + EPS) * step;
  const list = (walks ?? []).filter(w => w?.id && w.points?.length >= 2);
  const zonesAt = typeof o.step === "function" ? narrowZones(o.step) : null;
  const L = list.find(w => w.id === o.leaderId) ?? null;
  const info = new Map(list.map(w => {
    const v = (w.speed ?? MOTION.speed) / 1000;                       // squares per ms
    const tr = trajectory(w.points, { speed: w.speed ?? MOTION.speed });
    return [w.id, { w, tr, v, box: boxOf(w.points, w.r), spans: zoneSpans(tr, zonesAt), lead: w === L }];
  }));
  // The pack: one wave after the leader; when the leader starts behind (by walk to the drop, planLead's `left`), once
  // it is a wave past the frontmost member.
  let pack = 0;
  if (L && list.length > 1) {
    const lefts = list.filter(w => w !== L).map(w => w.left).filter(Number.isFinite);
    const behind = Number.isFinite(L.left) && lefts.length ? Math.max(0, L.left - Math.min(...lefts)) : 0;
    pack = Math.min(capStep, Math.ceil((step + behind / info.get(L.id).v) / step - EPS) * step);
  }
  /** Does member B (at delay dB) conflict with A (at dA)? */
  const conflict = (B, dB, A, dA) => {
    if (!boxesMeet(B.box, A.box)) return false;
    const same = Math.abs(dA - dB) < EPS;
    const TA = delayed(A.tr, dA), TB = delayed(B.tr, dB);
    // A narrow point: one through at a time (the latency buffer between two waves).
    for (const [key, sa] of A.spans) {
      const sb = B.spans.get(key);
      if (!sb) continue;
      const m = same ? 0 : gap / Math.min(A.v, B.v);
      for (const [a0, a1] of sa) for (const [b0, b1] of sb) {
        if (Math.min(a1 + dA + m, b1 + dB) - Math.max(a0 + dA - m, b0 + dB) > 1) return true;
      }
    }
    // A deep, long overlap of the two moving (two ways merging into one lane).
    if (closeTime(TA, TB, A.w.r + B.w.r - STAGGER.deep) > STAGGER.longMs) return true;
    // One walking through the other at rest: still at its start, or already at its slot. Never against the leader.
    if (A.lead || B.lead) return false;
    // In the same update a brush is soft, and so is a pass as the other arrives (a crossing): one wave after it has
    // come to rest it is at rest. Across waves the latency buffer: it may be drawn leaving late, or arriving early.
    const atRest = (M, R, mR) => {
      const lim = M.w.r + R.w.r - (same ? STAGGER.brush : STAGGER.slack);
      const TM = M === A ? TA : TB, TR = R === A ? TA : TB;
      return nearestWhile(TM, R.w.points[0], -Infinity, TR.start + mR) < lim - EPS
        || nearestWhile(TM, R.w.points.at(-1), TR.end - mR, Infinity) < lim - EPS;
    };
    return atRest(B, A, same ? -step : gap / A.v) || atRest(A, B, same ? -step : gap / B.v);
  };
  // The order every screen sees (0.10 L3): a drop's waves reach every client in the order they were sent, each a
  // whole update (a lost packet or a stalled tab holds the later ones back with it, never ahead of it). So one whose
  // route passes a member's slot goes no later than that member, and one whose route passes a member's start goes no
  // earlier than that member: on no screen is a member at rest in a way it was sent through. Not for the leader (R6).
  const passes = (X, c, r) => !!routeEnters(X.w.points, X.w.r, [{ x: c.x, y: c.y, r }], STAGGER.slack);
  const delays = {}, crowded = [], timed = [];
  for (const w of list) {
    const me = info.get(w.id);
    if (me.lead) { delays[w.id] = 0; timed.push({ me, d: 0 }); continue; }
    let lo = pack, hi = capStep;
    for (const t of o.fifo === false ? [] : timed) {
      if (t.me.lead) continue;
      if (passes(t.me, w.points.at(-1), w.r) || passes(me, t.me.w.points[0], t.me.w.r)) lo = Math.max(lo, t.d);
      if (passes(me, t.me.w.points.at(-1), t.me.w.r) || passes(t.me, w.points[0], w.r)) hi = Math.min(hi, t.d);
    }
    let best = null;
    for (let d = lo; d <= Math.max(lo, hi) + EPS; d += step) {
      let n = 0;
      for (const t of timed) if (conflict(me, d, t.me, t.d)) n += 1;
      if (best === null || n < best.n) best = { d, n };
      if (n === 0) break;
    }
    if (best.n > 0 || lo > hi + EPS) crowded.push(w.id);
    delays[w.id] = best.d;
    timed.push({ me, d: best.d });
  }
  const total = Object.values(delays).reduce((a, b) => Math.max(a, b), 0);
  return { delays, order: list.map(w => w.id), total, crowded, pack };
}

