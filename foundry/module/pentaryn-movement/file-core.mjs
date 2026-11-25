/**
 * Pure planning of a group drag (pentaryn-movement 0.10; plan context/plans/pathfinding-2026-11.md §18; Joe's leader
 * rule, 2026-11-24; Fable's review 3 §1). No Foundry globals.
 *   - planLead (below, "The leader plan"): the token grabbed leads; where it is dropped picks the shape (march / swarm);
 *     each member takes the best-ranked free square it can reach and gets one route search to it.
 *   - staggerFile (0.10 L2, R5): the start delays: the leader at once, the pack one wave later, single file only at a
 *     narrow point (the last within 4 s of the drop).
 * Units: centres in grid squares (as motion-core). Touching is fine; coming inside is not. (0.10 L1: the 0.9 B0
 * planner, its formation spots, candidate rings, walk ratio, tries, route-clearance test, fixed-point passes,
 * reorders and waveWays are gone.)
 */

import { MOTION, closeTime, delayed, dist, nearestWhile, trajectory } from "./motion-core.mjs";
import { firstIntrusion, pathLength } from "./group-core.mjs";
import { drain, pointsBack } from "./narrow-core.mjs";

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

/* -------------------------------------------- */
/*  The leader plan (0.10, L1)                  */
/* -------------------------------------------- */

/**
 * The leader rule (Joe 2026-11-24; plan §18; Fable's review 3 §1). One mechanism for both shapes: squares near the
 * drop get a rank; each member in turn (the leader, then least walk left) takes the best-ranked free square it can
 * reach, then gets one route search to it. No formation offsets.
 *   MARCH (dropped on the floor): the leader ends on the drop square by its own route, round the tokens standing
 *     outside the group and through its own members. A square's rank is its walk from the square the leader steps
 *     out of on its last step (B), the leader's squares shut; only squares nearer B than the leader's own count (a tie
 *     only when it lies behind the leader's last step), so nobody rests beside or ahead of it. The door plug (0.10.2,
 *     Joe 2026-11-24 / 11-25): when the leader's route came through a narrow point (a one-wide square, a door in a
 *     thin wall; narrowZones) and it rests within LEAD.plug of walk past it, on squares that are not narrow, the
 *     squares on its side within LEAD.beside of it and not ahead of it along its last step (`out.choke.inside`) go
 *     first: those behind it (by their rank), then those beside it (ranked by that walk); a square of them that would
 *     shut the others off from the narrow point's way in waits until the others are taken, so the doorway fills last.
 *     The rest wait outside, behind as before.
 *   SWARM (dropped on a token outside the group): ranks are rings out from the target's whole footprint, never across a
 *     wall (ring 1 touches it). The leader has first pick.
 * "Can reach": a flood from the member's own way in (its own square, else the ranked area's square nearest it), shut
 * by the tokens standing outside the group, the squares already taken and the members that stay, kept inside the area;
 * a tie on rank goes to the least walk from there. A route enters no standing token, no slot given out before it and
 * no member that stays (the leader's: no standing token). A member that stays where it stands is named; one whose
 * stay falls on a slot already given out, or across a route already given out, takes that member with it (it stays
 * too) or makes it go round (one new search). Units: centres in grid squares; a square (i, j) is row i, column j.
 */
export const LEAD = Object.freeze({
  cells: 6,            // the ranked area: the nearest cells × members + extra squares (it grows with the group)
  extra: 40,
  far: 6000,           // the walk to the drop from where the members start settles at most this many squares
  maxWalk: 40,         // and none walked farther than this from where it starts (squares)
  rings: 8,            // swarm rings round the target at most
  tries: 2,            // route searches a member at most (the second only after the first failed)
  totalMs: 1500,       // planning time for the whole drop: a member not reached by then stays and is named "budget"
  plug: 4,             // the door plug (0.10.2): a march leader resting within this walk past a door or mouth ...
  beside: 2.5,         // ... has the squares inside within this walk of it, not ahead of it, filled first
});

const cellKey = (i, j) => `${i},${j}`;
const parseKey = k => { const n = k.indexOf(","); return { i: +k.slice(0, n), j: +k.slice(n + 1) }; };
const cellCentre = c => ({ x: c.j + 0.5, y: c.i + 0.5 });
const N8 = [[0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/** The squares a w×h token centred at c covers (squares whose centre lies inside its box; at least the nearest one). */
export function footprintCells(c, w = 1, h = w) {
  const out = [];
  for (let i = Math.ceil(c.y - h / 2 - 0.5); i <= Math.floor(c.y + h / 2 - 0.5); i++) {
    for (let j = Math.ceil(c.x - w / 2 - 0.5); j <= Math.floor(c.x + w / 2 - 0.5); j++) out.push({ i, j });
  }
  return out.length ? out : [{ i: Math.floor(c.y), j: Math.floor(c.x) }];
}

/** A tiny binary heap of [d, key]. */
export function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(d, k) {
      a.push([d, k]);
      for (let n = a.length - 1; n > 0;) { const p = (n - 1) >> 1; if (a[p][0] <= a[n][0]) break; [a[p], a[n]] = [a[n], a[p]]; n = p; }
    },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        for (let n = 0; ;) {
          const l = 2 * n + 1, r = l + 1;
          let m = n;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === n) break;
          [a[m], a[n]] = [a[n], a[m]]; n = m;
        }
      }
      return top;
    },
  };
}

/**
 * One plan's memo of the step oracle (0.10.2): the same answer for the same step, asked once. Every flood of a plan
 * (the rank, the walk to the drop, each member's reach, the door plug's seal tests) asks the same few hundred steps
 * again and again. A step between non-neighbours, or off whole squares, is asked through.
 */
function stepMemo(step) {
  if (typeof step !== "function") return step;
  const memo = new Map();
  return (a, b) => {
    const di = b.i - a.i, dj = b.j - a.j;
    if (!(Number.isInteger(a.i) && Number.isInteger(a.j) && di >= -1 && di <= 1 && dj >= -1 && dj <= 1 && Math.abs(a.i) < 4096 && Math.abs(a.j) < 4096)) return step(a, b);
    const k = ((a.i + 4096) * 8192 + (a.j + 4096)) * 9 + (di + 1) * 3 + (dj + 1);
    if (memo.has(k)) return memo.get(k);
    const v = step(a, b);
    memo.set(k, v);
    return v;
  };
}

/**
 * Which of the squares `keys` a walk from `origins` reaches (8 neighbours; `step(a, b)` one step open, `ok(b)` b may
 * be entered; origins are never tested): walkFrom's squares without their distances, so it stops as soon as every one
 * of them is reached (0.10.2: the door plug's seal test, one walk per square it judges). A Set of the keys reached.
 */
function reachOf(origins, step, ok, keys) {
  const want = new Set(keys), got = new Set(), seen = new Set(), q = [];
  const see = (c, k) => { seen.add(k); q.push(c); if (want.has(k)) got.add(k); };
  for (const c of origins) { const k = cellKey(c.i, c.j); if (!seen.has(k)) see(c, k); }
  for (let h = 0; h < q.length && got.size < want.size; h++) {
    const n = q[h];
    for (const [di, dj] of N8) {
      const m = { i: n.i + di, j: n.j + dj };
      const mk = cellKey(m.i, m.j);
      if (seen.has(mk) || !ok(m) || !step(n, m)) continue;
      see(m, mk);
    }
  }
  return got;
}

/**
 * Walking distance (8 neighbours, √2 diagonals) from `origins` (squares, distance 0) to the nearest `maxCells` squares
 * within `maxWalk`, as Map key → distance. `step(a, b)` says whether one step is open; `ok(b)` whether b may be
 * entered at all (origins are never tested). `hops`: count steps instead (rings). `until` (keys): stop as soon as
 * every one of them is settled (the map is in settling order, nearest first).
 */
export function walkFrom(origins, step, { ok = () => true, maxCells = Infinity, maxWalk = Infinity, hops = false, until = null } = {}) {
  const out = new Map();
  const h = heap();
  const best = new Map();
  let left = until ? new Set(until) : null;
  for (const o of origins) { const k = cellKey(o.i, o.j); if (!best.has(k)) { best.set(k, 0); h.push(0, k); } }
  while (h.size && out.size < maxCells) {
    const [d, k] = h.pop();
    if (out.has(k) || d > best.get(k) + EPS) continue;
    out.set(k, d);
    if (left) { left.delete(k); if (!left.size) break; }
    const n = parseKey(k);
    for (const [di, dj, c] of N8) {
      const m = { i: n.i + di, j: n.j + dj };
      const mk = cellKey(m.i, m.j);
      if (out.has(mk)) continue;
      const nd = d + (hops ? 1 : c);
      if (nd > maxWalk + EPS || nd >= (best.get(mk) ?? Infinity) - EPS) continue;
      if (!ok(m) || !step(n, m)) continue;
      best.set(mk, nd);
      h.push(nd, mk);
    }
  }
  return out;
}

/**
 * The door plug's narrow point (0.10.2): the nearest narrow point (narrowZones: a one-wide square, the door in a thin
 * wall) back along the leader's route within LEAD.plug of walk from its rest, when none of the leader's own squares is
 * narrow (a leader in a tunnel or a doorway keeps the line behind it). { key, x, y, cells, past } or null (cells: its
 * square, or the two its door joins; past: the walk back to it); `o.chokeOk` may refuse it (then none: a narrow point
 * farther back never counts).
 */
function chokeBehind(points, mine, o) {
  if (!(points?.length >= 2)) return null;
  const zonesAt = narrowZones(o.step);
  if (mine.some(c => zonesAt(cellCentre(c)).some(z => z.key[0] === "c"))) return null;
  const plug = o.plug ?? LEAD.plug;
  for (let k = 1; k * 0.1 <= plug + EPS; k++) {
    const p = pointsBack(points, [k * 0.1])[0];
    if (!p) return null;
    const z = zonesAt(p)[0];
    if (!z) continue;
    const [a, b] = z.key.slice(1).split(",").map(Number);
    const cells = z.key[0] === "c" ? [{ i: a, j: b }] : z.key[0] === "v" ? [{ i: a, j: b }, { i: a + 1, j: b }] : [{ i: a, j: b }, { i: a, j: b + 1 }];
    const out = { ...z, cells, past: k / 10 };
    return !o.chokeOk || o.chokeOk(out) ? out : null;
  }
  return null;
}

/** Does the step a → b go through narrow point z (into its one-wide square, or across its door)? */
function crossesZone(z) {
  const [p, q] = z.key.slice(1).split(",").map(Number);
  if (z.key[0] === "c") return (a, b) => b.i === p && b.j === q;
  if (z.key[0] === "v") return (a, b) => Math.min(a.i, b.i) === p && Math.max(a.i, b.i) === p + 1 && (a.j === q || b.j === q);
  return (a, b) => Math.min(a.j, b.j) === q && Math.max(a.j, b.j) === q + 1 && (a.i === p || b.i === p);
}

/**
 * Plan a group drag by the leader rule.
 * @param {object} spec
 * @param {{ id, r, w?, h?, start: {x,y} }[]} spec.members  one entry a stack (its leader); the leader among them
 * @param {string} spec.leaderId                the token grabbed (a rider's mount)
 * @param {{x,y}} spec.drop                     the leader's drop centre (march)
 * @param {{ id?, x, y, w?, h? }|null} [spec.target]  swarm: the token dropped on (its centre and size)
 * @param {{x,y,r,id?}[]} [spec.standing]       tokens standing outside the group (the target among them)
 * @param {{x,y,r,id?}[]} [spec.taken]          a fight's mates at rest (0.10 F1): taken like slots, shutting no flood
 * @param {{ at: {x,y}, from: {x,y} }} [spec.leaderAt]  the leader already at rest at `at`, its last step from `from`
 *                                              (a fight's later turn); then it is not planned
 * @param {object} o oracles
 * @param {(m, c) => boolean} o.walkable        can m stand with its centre at c?
 * @param {(a, b) => boolean} o.step            is one step between neighbouring squares a → b open (walls only)?
 * @param {(m, from, to, avoid) => {x,y}[]|null} [o.route]  a route (centres) round `avoid` circles (their own radius;
 *                                              the oracle adds m's), or null. Without it the slots are picked and
 *                                              nothing is searched (a fight routes at its turn).
 * @param {() => number} [o.now]                the plan's clock (ms)
 * @param {(z: {key, x, y, cells}) => boolean} [o.chokeOk]  may this narrow point open the door plug's squares (file.mjs: not
 *                                              one on a narrow way's tight squares, whose line behind is lineBehind's)?
 * @returns {{ shape: "march"|"swarm", leader: string, target: string|null, none: boolean,
 *            members: Object<string, { slot, points, stay?, rank?, atStart?, left }>, order: string[], byWalk: string[], stayed: string[],
 *            searches: number, failed: number, ms: number, behind: {x,y}|null, lastStep: {x,y}|null, blocker: string|null,
 *            choke: { key, x, y, past, inside: string[] }|null }}
 *          none: the leader has no way (nobody moves, "No route there"; blocker: the member that stays on its rest
 *          square, when that is why); stayed: the members named; left: a member's
 *          walk to the drop (the leader's squares in a march, the target's in a swarm) from where it starts; byWalk:
 *          the leader, then least walk left (a fight's order, 0.10 L3 R7: its slots are picked at each turn)
 */
export function planLead(spec, o) { return drain(planLeadSteps(spec, o)); }

/**
 * planLead in steps (0.10.2: a big drop over a narrow way never freezes the page). It yields before each member and
 * inside a route the `route` oracle gives as a generator (file.mjs: the pathfinder's slices); once the leader's slot and
 * route are known it yields `{ lead }` (its entry, with `id`), so the drop can send the leader at once. Drained it is
 * planLead (`drain`), the same plan for the same oracles and clock.
 */
export function* planLeadSteps(spec, o) {
  o = { ...o, step: stepMemo(o.step) };
  const now = o.now ?? (() => 0);
  const t0 = now();
  const members = (spec.members ?? []).map(m => ({ ...m, w: m.w ?? 1, h: m.h ?? m.w ?? 1 }));
  const byId = new Map(members.map(m => [m.id, m]));
  const L = byId.get(spec.leaderId) ?? members[0];
  const standing = (spec.standing ?? []).map(s => ({ x: s.x, y: s.y, r: s.r, id: s.id ?? null }));
  const target = spec.target ?? null;
  const shape = target ? "swarm" : "march";
  const out = { shape, leader: L?.id ?? null, target: target?.id ?? null, none: false, members: {}, order: [], byWalk: [], stayed: [],
    searches: 0, failed: 0, ms: 0, behind: null, lastStep: null, blocker: null, choke: null };
  if (!L) return out;
  const route = o.route ?? null;
  const n = members.length;
  const flood = { maxCells: (o.cells ?? LEAD.cells) * n + (o.extra ?? LEAD.extra), maxWalk: o.maxWalk ?? LEAD.maxWalk };
  const overStanding = c => standing.some(s => dist(cellCentre(c), s) < s.r + 0.5 - EPS);
  const claims = (spec.taken ?? []).map(t => ({ x: t.x, y: t.y, r: t.r, id: t.id ?? null })); // { x, y, r, id }: slots given out
  const stays = [];                       // { x, y, r, id }: members that stay where they stand
  const blockedBy = list => c => list.some(s => dist(cellCentre(c), s) < s.r + 0.5 - EPS);
  const finish = () => { out.ms = Math.round((now() - t0) * 10) / 10; return out; };
  // No member starts on the leader's slot: nothing later can make the leader stay (only such a member blocks it).
  const freeOfStarts = (lm, slot) => members.every(q => q === lm || dist(q.start, slot) >= q.r + lm.r - EPS);
  const search = function* (m, to, avoid) {
    out.searches += 1;
    let pts = null;
    try {
      const r = route(m, m.start, to, avoid);
      pts = r && typeof r.next === "function" ? yield* r : r;
    } catch { pts = null; }
    const ok = pts?.length >= 2 && dist(pts.at(-1), to) <= 0.05 && !routeEnters(pts, m.r, avoid);
    if (!ok) { out.failed += 1; return null; }
    return pts;
  };
  const everyoneStays = why => {
    out.none = true;
    for (const m of members) { out.members[m.id] = { slot: { ...m.start }, points: [m.start], stay: why }; }
    out.stayed = members.map(m => m.id);
    out.order = [L.id, ...members.filter(m => m !== L).map(m => m.id)];
    out.byWalk = byWalk(m => { let b = Infinity; for (const c of footprintCells(m.start, m.w, m.h)) b = Math.min(b, lead.get(cellKey(c.i, c.j)) ?? Infinity); return b; });
    return finish();
  };
  // A fight's order (R7): the leader, then least walk left (ties by id), whatever slots are given out.
  const byWalk = d => [L.id, ...members.filter(m => m !== L).sort((a, b) => (d(a) - d(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(m => m.id)];

  // The walk to the drop (the leader's squares in a march, the target's in a swarm), round the tokens standing: out
  // until every member's own square is settled (their "walk left" and their way in), at most LEAD.far squares. Its
  // nearest squares are the area the members may rest in.
  let nearest = [];
  const starts = new Set(members.flatMap(m => footprintCells(m.start, m.w, m.h).map(c => cellKey(c.i, c.j))));
  const leadFrom = from => {
    const map = walkFrom(from, o.step, { ok: c => !overStanding(c), maxWalk: Infinity, maxCells: Math.max(o.far ?? LEAD.far, 2 * flood.maxCells), until: [...starts] });
    // Twice the rank flood's size: it reaches both ways, and a square it never settled is not known to be behind.
    let k = 0;
    for (const key of map.keys()) { if (k++ >= 2 * flood.maxCells || map.get(key) > flood.maxWalk + EPS) break; nearest.push(key); }
    if (map.size < 2 * flood.maxCells) {
      // Every start settled early: the area still needs its full size.
      const more = walkFrom(from, o.step, { ok: c => !overStanding(c), ...flood, maxCells: 2 * flood.maxCells });
      for (const [key, d] of more) if (!map.has(key)) map.set(key, d);
      nearest = [...more.keys()];
    }
    return map;
  };
  // The origin of the ranks and of "walk left": the leader's squares (march) or the target's (swarm).
  let rank = new Map(), lead = new Map(), origins = [];
  const inside = new Map();               // the door plug's squares (0.10.2): key → walk from the leader
  const beside = new Set();               // ... those of them not behind the leader (ranked by their walk from it)
  const wayInto = [];                     // ... and the narrow point's square(s) outside them
  if (!target) {
    // The leader's slot and route (march).
    let at = spec.leaderAt?.at ?? null, from = spec.leaderAt?.from ?? null;
    if (!at) {
      const freeAt = c => clearOf(c, L.r, standing) && o.walkable(L, c);
      let slot = spec.drop ? { x: spec.drop.x, y: spec.drop.y } : null;
      if (!slot) return everyoneStays("noRoute");
      if (!freeAt(slot)) {
        // Dropped on a token it may not swarm (a hidden one) or where it cannot stand: the nearest free square by walking.
        const near = walkFrom(footprintCells(slot, L.w, L.h), o.step, { ok: c => !overStanding(c), maxCells: 60, maxWalk: 4 });
        const spots = [...near].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
          .map(([k]) => { const c = parseKey(k); return { x: c.j + L.w / 2, y: c.i + L.h / 2 }; }).filter(freeAt);
        slot = spots[0] ?? null;
        if (!slot) return everyoneStays("noRoute");
      }
      if (dist(slot, L.start) < EPS) out.members[L.id] = { slot, points: [L.start], atStart: true };
      else {
        if (!route) out.members[L.id] = { slot, points: null };
        else {
          const pts = yield* search(L, slot, standing);
          if (!pts) return everyoneStays("noRoute");
          out.members[L.id] = { slot, points: pts, walk: pathLength(pts) };
        }
      }
      at = slot;
      yield { lead: { ...out.members[L.id], id: L.id }, free: freeOfStarts(L, slot) };
      const pts = out.members[L.id].points;
      from = pts?.length >= 2 ? pts.at(-2) : L.start;
    }
    claims.push({ x: at.x, y: at.y, r: L.r, id: L.id });
    // B: the square the leader steps out of on its last step.
    let u = { x: at.x - from.x, y: at.y - from.y };
    const len = Math.hypot(u.x, u.y);
    u = len > EPS ? { x: u.x / len, y: u.y / len } : { x: 0, y: 0 };
    out.lastStep = u;
    const mine = footprintCells(at, L.w, L.h);
    const mineKeys = new Set(mine.map(c => cellKey(c.i, c.j)));
    const openToMine = c => mine.some(f => Math.max(Math.abs(f.i - c.i), Math.abs(f.j - c.j)) === 1 && o.step(c, f));
    const goodB = c => c && !mineKeys.has(cellKey(c.i, c.j)) && !overStanding(c) && openToMine(c);
    let B = len > EPS ? footprintCells({ x: at.x - u.x * (L.r + 0.5), y: at.y - u.y * (L.r + 0.5) }, 1, 1)[0] : null;
    if (!goodB(B)) {
      B = null;
      let bd = Infinity;
      for (const f of mine) for (const [di, dj] of N8) {
        const c = { i: f.i + di, j: f.j + dj };
        if (!goodB(c)) continue;
        const d = dist(cellCentre(c), from);
        if (d < bd - EPS) { bd = d; B = c; }
      }
    }
    origins = mine;
    lead = leadFrom(mine);
    const nearestSet = new Set(nearest);
    if (B) {
      out.behind = cellCentre(B);
      const behind = walkFrom([B], o.step, { ok: c => !overStanding(c) && !mineKeys.has(cellKey(c.i, c.j)), ...flood });
      for (const [k, d] of behind) {
        const f = nearestSet.has(k) ? lead.get(k) : undefined;
        if (f === undefined) continue;
        const c = cellCentre(parseKey(k));
        const back = (c.x - at.x) * u.x + (c.y - at.y) * u.y;
        if (d < f - EPS || (Math.abs(d - f) <= EPS && back < -EPS)) rank.set(k, d);
      }
      const choke = route && !spec.leaderAt ? chokeBehind(out.members[L.id].points, mine, o) : null;
      if (choke) {
        // The door plug (0.10.2): the squares on the leader's side of the narrow point, near it, never ahead of it.
        const shut = crossesZone(choke);
        const side = (a, b) => o.step(a, b) && !shut(a, b);
        const near = walkFrom(mine, side, { ok: c => !overStanding(c), maxWalk: o.beside ?? LEAD.beside });
        // The way in: the narrow point's square(s) outside the leader's side.
        const ours = walkFrom(mine, side, { maxCells: 2 * flood.maxCells });
        wayInto.push(...choke.cells.filter(c => !ours.has(cellKey(c.i, c.j))));
        for (const [k, d] of near) {
          if (mineKeys.has(k)) continue;
          const c = cellCentre(parseKey(k));
          if ((c.x - at.x) * u.x + (c.y - at.y) * u.y > EPS) continue;
          inside.set(k, d);
          if (!rank.has(k)) { rank.set(k, d); beside.add(k); }
        }
        if (inside.size) out.choke = { key: choke.key, x: choke.x, y: choke.y, past: choke.past, inside: [...inside.keys()] };
      }
    }
    out.order.push(L.id);
  } else {
    origins = footprintCells(target, target.w ?? 1, target.h ?? target.w ?? 1);
    rank = walkFrom(origins, o.step, { hops: true, maxCells: flood.maxCells, maxWalk: o.rings ?? LEAD.rings });
    for (const c of origins) rank.delete(cellKey(c.i, c.j));
    lead = leadFrom(origins);
  }
  const area = new Set([...nearest, ...rank.keys()]);
  const walkLeft = m => {
    let best = Infinity;
    for (const c of footprintCells(m.start, m.w, m.h)) best = Math.min(best, lead.get(cellKey(c.i, c.j)) ?? Infinity);
    return Number.isFinite(best) ? best : 1e6 + dist(m.start, cellCentre(origins[0]));
  };
  /** The top-left square of m's body standing over entry square(s) `cells` (its own when they are its own). */
  const topLeftOf = (m, cells) => {
    const own = footprintCells(m.start, m.w, m.h);
    if (cells.every(c => own.some(q => q.i === c.i && q.j === c.j))) return own[0];
    const c = cells[0];
    return { i: c.i - Math.floor((m.h - 1) / 2), j: c.j - Math.floor((m.w - 1) / 2) };
  };
  /** Where m's shortest walk to the drop enters the area: down the walk from its own squares (no search). */
  const wayIn = m => {
    const own = footprintCells(m.start, m.w, m.h);
    const inside = own.filter(c => area.has(cellKey(c.i, c.j)));
    if (inside.length) return inside;
    let c = own.filter(q => lead.has(cellKey(q.i, q.j))).sort((a, b) => lead.get(cellKey(a.i, a.j)) - lead.get(cellKey(b.i, b.j)))[0];
    for (let guard = 0; c && guard < 4 * (o.far ?? LEAD.far); guard++) {
      if (area.has(cellKey(c.i, c.j))) return [c];
      const d = lead.get(cellKey(c.i, c.j));
      let nx = null, nd = d - EPS;
      for (const [di, dj] of N8) {
        const q = { i: c.i + di, j: c.j + dj };
        const v = lead.get(cellKey(q.i, q.j));
        if (v !== undefined && v < nd && o.step(c, q)) { nd = v; nx = q; }
      }
      c = nx;
    }
    return null;
  };
  const rest = members.filter(m => target || m !== L)
    .sort((a, b) => (a === L ? -1 : b === L ? 1 : 0) || walkLeft(a) - walkLeft(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Ranked spots for a w×h member: every ranked square as its top-left, all its squares ranked.
  const spotsFor = m => {
    const out2 = [];
    for (const [k] of rank) {
      const c = parseKey(k);
      let worst = -Infinity, all = true, tier = 0;
      for (let a = 0; a < m.h && all; a++) for (let b = 0; b < m.w; b++) {
        const q = cellKey(c.i + a, c.j + b), v = rank.get(q);
        if (v === undefined) { all = false; break; }
        worst = Math.max(worst, v);
        tier = Math.max(tier, !inside.has(q) ? 2 : beside.has(q) ? 1 : 0);
      }
      if (all) out2.push({ c, k, rank: worst, tier: inside.size ? tier : 0, centre: { x: c.j + m.w / 2, y: c.i + m.h / 2 } });
    }
    return out2;
  };
  const stayHere = function* (m, why) {
    out.members[m.id] = { slot: { ...m.start }, points: [m.start], stay: why };
    const me = { x: m.start.x, y: m.start.y, r: m.r, id: m.id };
    stays.push(me);
    // A slot given out where it stands: that member stays too. A route given out through it: round it, else stays;
    // the leader, with no way round, keeps its way through it (0.10 sign-off X1, R6: the group never blocks its own
    // leader; only one standing on its rest square does, and is named).
    for (const [id, e] of Object.entries(out.members)) {
      if (id === m.id || e.stay) continue;
      const other = byId.get(id);
      if (dist(e.slot, me) < other.r + me.r - EPS) { if (other === L) out.blocker = m.id; drop(id); yield* stayHere(other, "blocked"); continue; }
      if (e.points?.length >= 2 && routeEnters(e.points, other.r, [me])) {
        const avoid = id === L.id && !target ? [...standing, ...stays] : [...standing, ...claims.filter(c => c.id !== id), ...stays];
        let pts = null;
        if (route) pts = yield* search(other, e.slot, avoid);
        if (pts) { e.points = pts; e.walk = pathLength(pts); } else if (other !== L) { drop(id); yield* stayHere(other, "noRoute"); }
      }
    }
  };
  const drop = id => { const k = claims.findIndex(c => c.id === id); if (k >= 0) claims.splice(k, 1); };

  // A member standing where a slot is given out goes next (it must make room while there is room to make): the queue
  // is the plan order, such members moved to its front as each slot is given out.
  const queue = [...rest];
  const makeRoom = (c, r) => {
    const hit = queue.filter(q => dist(q.start, c) < q.r + r - EPS);
    if (!hit.length) return;
    for (const q of hit) queue.splice(queue.indexOf(q), 1);
    queue.unshift(...hit);
  };
  if (!target && out.members[L.id]) makeRoom(out.members[L.id].slot, L.r);
  while (queue.length) {
    yield;
    const m = queue.shift();
    out.order.push(m.id);
    if (now() - t0 > (o.totalMs ?? LEAD.totalMs)) { yield* stayHere(m, "budget"); continue; }
    const taken = blockedBy([...claims, ...stays]);
    // Its way in: its own square in the area, else where its walk to the drop enters it, else the area's square
    // nearest it.
    let entry = wayIn(m);
    if (!entry) {
      let bk = null, bd = Infinity;
      for (const k of area) {
        const c = parseKey(k);
        if (overStanding(c) || taken(c)) continue;
        const d = dist(cellCentre(c), m.start);
        if (d < bd - EPS) { bd = d; bk = c; }
      }
      entry = bk ? [bk] : [];
    }
    // The flood moves m's whole body (its top-left square; every square it covers steps, in the area and free) and
    // never squeezes diagonally past a token (the route keeps out of both squares beside a diagonal step).
    const freeCell = c => area.has(cellKey(c.i, c.j)) && !overStanding(c) && !taken(c);
    const body = c => { for (let a = 0; a < m.h; a++) for (let b = 0; b < m.w; b++) if (!freeCell({ i: c.i + a, j: c.j + b })) return false; return true; };
    const bodyStep = (a, b) => {
      for (let da = 0; da < m.h; da++) for (let db = 0; db < m.w; db++) if (!o.step({ i: a.i + da, j: a.j + db }, { i: b.i + da, j: b.j + db })) return false;
      return a.i === b.i || a.j === b.j || (body({ i: a.i, j: b.j }) && body({ i: b.i, j: a.j }));
    };
    const origin = entry.length && (m.w > 1 || m.h > 1) ? [topLeftOf(m, entry)] : entry;
    const reach = origin.length ? walkFrom(origin, bodyStep, { ok: body }) : new Map();
    const avoidAll = [...standing, ...claims, ...stays];
    const cands = spotsFor(m).map(s => ({ ...s, wd: reach.get(s.k) ?? Infinity })).filter(s => Number.isFinite(s.wd))
      .sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.wd - b.wd || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    // A swarm's touching square that would wall off another free touching square from the rest of the area waits
    // (0.10 live round 2, S02.d: a Large one square off a wall; the two squares between the corners and the wall were
    // sealed once both corners were given out, and two members took ring 2 with ring 1 not full).
    // The door plug's squares (0.10.2) the same way: one that would shut another off from the narrow point's way in (the
    // square just inside the door) waits while one that does not is left. A swarm's "outside" is every ranked square
    // past ring 1; the door plug's, the narrow point's square(s) outside the leader's side.
    const inner = s => (target ? s.rank === 1 : s.tier < 2 && inside.size > 0);
    const sealsWith = (own, known = null) => {
      const open = c => !own.has(cellKey(c.i, c.j)) && freeCell(c);
      const ring = [], outer = [];
      for (const [k, v] of rank) { const c = parseKey(k); if (open(c) && (target ? v === 1 : inside.has(k))) ring.push(c); else if (target && open(c)) outer.push(c); }
      if (!target) outer.push(...wayInto.filter(c => !own.has(cellKey(c.i, c.j))));
      if (!ring.length || !outer.length) return [];
      // The door plug's walk, as the member's own flood: never diagonally past a square taken (the cheap corner test
      // first). Only which ring squares it reaches counts (reachOf), never those `known` cut already: taking more
      // squares never reopens one.
      const by = target ? o.step : (a, b) => (a.i === b.i || a.j === b.j || (open({ i: a.i, j: b.j }) && open({ i: b.i, j: a.j }))) && o.step(a, b);
      const keys = ring.map(c => cellKey(c.i, c.j));
      const got = reachOf(outer, by, open, keys.filter(k => !known?.has(k)));
      return keys.filter(k => !got.has(k));
    };
    // A swarm judges every free touching square; the door plug only those it could reach before (one it never could
    // does not hold the doorway back).
    const cutBefore = !target && inside.size ? new Set(sealsWith(new Set())) : null;
    const seals = s => {
      if (!inner(s)) return false;
      const cut = sealsWith(new Set(footprintCells(s.centre, m.w, m.h).map(c => cellKey(c.i, c.j))), cutBefore);
      return cutBefore ? cut.some(k => !cutBefore.has(k)) : cut.length > 0;
    };
    if (target || inside.size) {
      const k = cands.findIndex(s => inner(s) && !seals(s));
      if (k > 0) cands.unshift(...cands.splice(k, 1));
    }
    let picked = null, tries = 0, why = cands.length ? "noRoute" : "noSpot";
    // The leader of a swarm walks through its own group, also a member that stays (X1); everyone else round the
    // slots given out and the stays.
    const avoid = m === L ? standing : avoidAll;
    for (const s of cands) {
      if (!clearOf(s.centre, m.r, avoidAll) || !o.walkable(m, s.centre)) continue;
      if (dist(s.centre, m.start) < EPS) { picked = { slot: s.centre, points: [m.start], atStart: true, rank: s.rank }; break; }
      if (!route) { picked = { slot: s.centre, points: null, rank: s.rank }; break; }
      if (tries >= (o.tries ?? LEAD.tries)) break;
      tries += 1;
      const pts = yield* search(m, s.centre, avoid);
      if (pts) { picked = { slot: s.centre, points: pts, rank: s.rank, walk: pathLength(pts) }; break; }
    }
    if (!picked) {
      if (m === L) return everyoneStays("noRoute");
      yield* stayHere(m, why);
      continue;
    }
    out.members[m.id] = picked;
    if (m === L) yield { lead: { ...picked, id: L.id }, free: freeOfStarts(L, picked.slot) };
    claims.push({ x: picked.slot.x, y: picked.slot.y, r: m.r, id: m.id });
    makeRoom(picked.slot, m.r);
  }
  if (out.members[L.id]?.stay) return everyoneStays("noRoute");
  out.stayed = out.order.filter(id => out.members[id]?.stay);
  // Each member's walk to the drop from where it starts (the leader's own, in a march): who is in front (staggerFile).
  for (const m of members) if (out.members[m.id]) out.members[m.id].left = walkLeft(m);
  out.byWalk = byWalk(walkLeft);
  return finish();
}
