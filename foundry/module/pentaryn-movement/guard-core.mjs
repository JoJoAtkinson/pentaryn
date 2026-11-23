/**
 * Pure runtime yield guard for pentaryn-movement 0.7.0 (overlap redesign stage 3 of 3; plan
 * context/plans/pathfinding-2026-11.md §15.8). No Foundry globals.
 *
 * A safety net under the plans (stage 1: standing tokens are hard obstacles; stage 2: server-ordered reservations).
 * Each client looks, a short time ahead, along the walk of every token whose move it started, and when that walk is
 * about to come closer than touching (less `tol`) to a token it must give way to, it yields. A firing is a planner
 * bug to fix, so every one is logged.
 *
 *   yieldsTo(me, other)          standing tokens never yield; between two movers the later in the server's order
 *                                yields (within a plan, plan order); a hidden token yields to a player's mover
 *   conflictAhead(me, others)    the first sampled time, within the horizon, that a walk meets one it yields to
 *   standingOnRoute(points, …)   does the rest of a walk pass through a token standing in it (not resumed then)
 *   asideSpot(me, threat, …)     the nearest spot off a higher mover's way (the lower one backs out of it)
 *   stepYield(y, …)              the yield's clock: wait, re-route once at 3 s, rest at 8 s or the move's deadline
 *                                (y.restAt, 0.8.0), whichever first (nothing waits forever)
 *   hashOf / nearby              a bucket grid, so a check costs O(tokens nearby)
 *
 * Units as motion-core.mjs: centres in grid squares, ms, squares per second.
 */

import { MOTION, dist } from "./motion-core.mjs";

export const GUARD = Object.freeze({
  everyMs: 50,          // out of combat, a check this often (a fight checks every frame: a square is ~170 ms)
  horizonMs: 450,       // how far ahead a walk is looked at (a pause on the sender reaches the others a latency later)
  sampleMs: 15,         // sampling step along the horizon (0.09 square at 6 squares per second)
  tol: 0.1,             // squares two movers may come inside touching before the guard fires (acceptance: 0.1)
  standTol: 0.04,       // squares a mover may come inside a standing token (acceptance: none; FR2-06 grazes of 5-11 px)
  clearMs: 150,         // its way clear this long before a yield resumes
  minHoldMs: 250,       // a yield holds at least this long (no flicker)
  rerouteMs: 3000,      // from the first yield: re-route once
  restMs: 8000,         // from the first yield: rest on the nearest free spot, with a quiet notice
  asideReach: 1.5,      // squares: how far a lower mover backs out of a higher one's way at most
  asideGap: 0.1,        // squares kept between the spot it backs out to and the higher one's way
  bucket: 2,            // squares per bucket of the nearby grid
  keep: 30,             // firings kept for status()
  apartMs: 150,         // two movers already inside each other: the gap must open within this (S3R1-03)
  apartGain: 0.02,      // squares the gap must open by in that time
});

const EPS = 1e-9;
/** Squares a pair already inside touching may still close in by (numeric slack). */
const HAIR = 0.02;

/* -------------------------------------------- */
/*  Priority                                    */
/* -------------------------------------------- */

/**
 * Who goes first: negative when `a` does. `ord` is the place in the server's order (a reservation's arrival, or an
 * unreserved move's), `k` the place within its plan, `id` a tie-break the same on every client. A token whose order
 * this client never saw (it started before this client did) goes first.
 * @param {{ ord?: number, k?: number, id?: string }} a
 * @param {{ ord?: number, k?: number, id?: string }} b
 */
export function comparePriority(a, b) {
  const oa = Number.isFinite(a?.ord) ? a.ord : -Infinity, ob = Number.isFinite(b?.ord) ? b.ord : -Infinity;
  if (oa !== ob) return oa < ob ? -1 : 1;
  const ka = Number.isFinite(a?.k) ? a.k : 0, kb = Number.isFinite(b?.k) ? b.k : 0;
  if (ka !== kb) return ka < kb ? -1 : 1;
  const ia = String(a?.id ?? ""), ib = String(b?.id ?? "");
  return ia === ib ? 0 : ia < ib ? -1 : 1;
}

/**
 * Does mover `me` give way to `other`? A standing token never yields (so every mover gives way to it). A hidden mover
 * gives way to a mover a player started (that player's planner and guard cannot see it: the GM side yields), and a
 * player's mover never gives way to a hidden one. Otherwise the earlier in the server's order goes first.
 * @param {{ prio, hidden?: boolean, byPlayer?: boolean }} me
 * @param {{ standing: boolean, prio, hidden?: boolean, byPlayer?: boolean }} other
 */
export function yieldsTo(me, other) {
  if (other.standing) return true;
  if (me.hidden && other.byPlayer && !other.hidden) return true;
  if (other.hidden && me.byPlayer) return false;
  return comparePriority(other.prio, me.prio) < 0;
}

/* -------------------------------------------- */
/*  Geometry along a walk                       */
/* -------------------------------------------- */

/** A walk's length (squares). */
export function lengthOf(points) {
  let L = 0;
  for (let k = 1; k < (points?.length ?? 0); k++) L += dist(points[k - 1], points[k]);
  return L;
}

/** Where a walk along `points` at `speed` squares per second is `t` ms after it starts (after `delay` ms standing). */
export function along(points, speed, t, delay = 0) {
  if (!points?.length) return null;
  let left = Math.max(t - delay, 0) * (speed > 0 ? speed : 0) / 1000;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    const L = dist(a, b);
    if (left <= L) {
      const f = L > EPS ? left / L : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    left -= L;
  }
  return { x: points.at(-1).x, y: points.at(-1).y };
}

/** Distance from point p to segment a–b. */
export function segmentDistance(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 > EPS ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

/** Distance from point p to a polyline (Infinity with no point). */
export function pathDistance(p, points) {
  if (!points?.length) return Infinity;
  if (points.length === 1) return dist(p, points[0]);
  let best = Infinity;
  for (let k = 1; k < points.length; k++) best = Math.min(best, segmentDistance(p, points[k - 1], points[k]));
  return best;
}

/* -------------------------------------------- */
/*  The look ahead                              */
/* -------------------------------------------- */

/**
 * The first sampled time within `horizonMs` at which `me` walking on comes closer to a token it gives way to than
 * touching less `tol` (a pair already closer than that now: closer than it is now, so one leaving a neighbour or a
 * stack never fires, and one already inside never gets further in). `me`: { c, r, points (from c) | null (standing), speed }. `others`: { id, c, r, points |
 * null, speed, delay, yieldTo, standing } (points from c; delay: ms before it sets off). Only those with `yieldTo`
 * count. Returns { id, t, d, lim, standing } (the earliest), or null.
 */
export function conflictAhead(me, others, { horizonMs = GUARD.horizonMs, sampleMs = GUARD.sampleMs, tol = GUARD.tol } = {}) {
  const mine = me.points?.length >= 2 ? me.points : null;
  const myReach = (mine ? (me.speed * horizonMs) / 1000 : 0) + me.r;
  let best = null;
  for (const o of others) {
    if (!o?.yieldTo) continue;
    const theirs = o.points?.length >= 2 ? o.points : null;
    if (!mine && !theirs) continue;                         // two standing tokens never meet
    const reach = (theirs ? (o.speed * horizonMs) / 1000 : 0) + o.r;
    const d0 = dist(me.c, o.c);
    if (d0 > myReach + reach + tol) continue;
    // Already inside touching by more than `tol` (a stack, a miss before): never closer than now (less a hair; a
    // member of the same plan less what its planner lets a pair that starts overlapped brush, MOTION.contact).
    const lim = Math.min(me.r + o.r - (o.standing ? Math.min(tol, GUARD.standTol) : tol), d0 - (o.samePlan ? MOTION.contact : HAIR));
    const until = best ? best.t : horizonMs;
    // Two movers of different moves already inside each other by more than `tol` must come apart: walking on side by
    // side or one behind the other at that depth is the overlap itself (S3R1-03: a player's stopped member walking
    // on and a GM member -77 px apart for 1.6 s, never closer, so never a firing). The one that gives way stops
    // unless its walk opens the gap within GUARD.apartMs; the other then walks off it.
    if (mine && theirs && !o.samePlan && d0 < me.r + o.r - tol) {
      const t = Math.min(GUARD.apartMs, horizonMs);
      const d = dist(along(mine, me.speed, t), along(theirs, o.speed, t, o.delay ?? 0));
      if (d < d0 + GUARD.apartGain && (!best || sampleMs < best.t)) { best = { id: o.id, t: sampleMs, d, lim: d0 + GUARD.apartGain, standing: !!o.standing, inside: true }; continue; }
    }
    if (lim <= 0) continue;
    for (let t = sampleMs; t <= until + EPS; t += sampleMs) {
      const p = mine ? along(mine, me.speed, t) : me.c;
      const q = theirs ? along(theirs, o.speed, t, o.delay ?? 0) : o.c;
      const d = dist(p, q);
      if (d < lim) {
        if (!best || t < best.t) best = { id: o.id, t, d, lim, standing: !!o.standing };
        break;
      }
    }
  }
  return best;
}

/**
 * Does the walk `points` (from where it stands) pass through a token standing in it? `circles`: { id, x, y, r }, those
 * it already overlaps at its start left out. The first one met ({ id }), or null. A yield resumes only when none is.
 */
export function standingOnRoute(points, r, circles, { tol = GUARD.tol } = {}) {
  if (!(points?.length >= 2)) return null;
  for (const c of circles) {
    const need = r + c.r - tol;
    if (dist(points[0], c) < need) continue;
    for (let k = 1; k < points.length; k++) if (segmentDistance(c, points[k - 1], points[k]) < need) return { id: c.id };
  }
  return null;
}

/** Hex lattice points round `c` (squares), nearest first, out to `reach`, `pitch` apart; `c` itself left out. */
export function aroundOf(c, reach = GUARD.asideReach, pitch = 0.5) {
  const out = [];
  const rows = Math.ceil(reach / (pitch * 0.866)) + 1;
  for (let i = -rows; i <= rows; i++) {
    const y = c.y + i * pitch * 0.866;
    const shift = (i & 1) ? pitch / 2 : 0;
    for (let j = -rows - 1; j <= rows + 1; j++) {
      const p = { x: c.x + j * pitch + shift, y };
      const d = dist(p, c);
      if (d > EPS && d <= reach + EPS) out.push(p);
    }
  }
  return out.sort((a, b) => dist(a, c) - dist(b, c) || a.y - b.y || a.x - b.x);
}

/**
 * Where a lower mover backs out to when it would otherwise stand in a higher one's way (the design's one-wide rule:
 * "the lower priority backs out to the nearest spot off the other's reserved route"). The nearest of `cands` (default:
 * the hex lattice within GUARD.asideReach) that keeps `gap` off the threat's way, clear of every standing circle, with
 * a straight step to it that passes through none, and that `ok(c)` accepts (walls, doors: the glue's). null when none.
 * @param {{ c, r }} me
 * @param {{ r, points }} threat   its way ahead (from where it is drawn)
 * @param {{ x, y, r }[]} standing
 */
export function asideSpot(me, threat, standing, { ok = () => true, gap = GUARD.asideGap, cands = null } = {}) {
  const off = me.r + (threat?.r ?? 0) + gap;
  if (!(threat?.points?.length >= 1)) return null;
  for (const c of cands ?? aroundOf(me.c)) {
    if (pathDistance(c, threat.points) < off) continue;
    if (standing.some(s => dist(c, s) < me.r + s.r - EPS)) continue;
    if (standing.some(s => dist(me.c, s) >= me.r + s.r - EPS && segmentDistance(s, me.c, c) < me.r + s.r - EPS)) continue;
    if (!ok(c)) continue;
    return { x: c.x, y: c.y };
  }
  return null;
}

/* -------------------------------------------- */
/*  The yield's clock                           */
/* -------------------------------------------- */

/** A mover's yield record: walking, never yielded yet. */
export function newYield() {
  return { phase: "walk", firstAt: null, since: null, clearSince: null, rerouted: false, firings: 0 };
}

/**
 * One look at a mover (`now` ms). Walking and `conflict`: it pauses (the first yield starts the clock). Held: it
 * resumes once its way has been `clear` GUARD.clearMs (and it held GUARD.minHoldMs); from the first yield, it
 * re-routes once at GUARD.rerouteMs and rests at GUARD.restMs, whatever else. Returns "pause" | "resume" | "reroute"
 * | "rest" | null, and moves `y` on. After "reroute" the glue sets `y.phase = "held"` again when there was no way.
 */
export function stepYield(y, { now, conflict = false, clear = false }) {
  if (y.phase === "done") return null;
  // GUARD.restMs from the first yield, or the move's own deadline (y.restAt, lifecycle-core: 0.8.0), whichever first.
  const restDue = () => now - y.firstAt >= GUARD.restMs || (Number.isFinite(y.restAt) && now >= y.restAt);
  if (y.phase === "walk") {
    if (!conflict) return null;
    y.firings += 1;
    if (y.firstAt === null) y.firstAt = now;
    if (restDue()) { y.phase = "done"; return "rest"; }
    y.phase = "held";
    y.since = now;
    y.clearSince = null;
    return "pause";
  }
  // held
  if (restDue()) { y.phase = "done"; return "rest"; }
  if (clear) {
    if (y.clearSince === null) y.clearSince = now;
    if (now - y.clearSince >= GUARD.clearMs && now - y.since >= GUARD.minHoldMs) {
      y.phase = "walk";
      y.clearSince = null;
      return "resume";
    }
    return null;
  }
  y.clearSince = null;
  if (!y.rerouted && now - y.firstAt >= GUARD.rerouteMs) {
    y.rerouted = true;
    y.phase = "walk";
    return "reroute";
  }
  return null;
}

/* -------------------------------------------- */
/*  Nearby                                      */
/* -------------------------------------------- */

/** A bucket grid of `items` ({ c: {x, y} }), `size` squares a bucket. */
export function hashOf(items, size = GUARD.bucket) {
  const map = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.c.x / size)},${Math.floor(it.c.y / size)}`;
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    list.push(it);
  }
  return { size, map };
}

/** The items whose bucket lies within `reach` squares of `c` (a superset of those within reach). */
export function nearby(hash, c, reach) {
  const { size, map } = hash;
  const out = [];
  const i0 = Math.floor((c.x - reach) / size), i1 = Math.floor((c.x + reach) / size);
  const j0 = Math.floor((c.y - reach) / size), j1 = Math.floor((c.y + reach) / size);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const list = map.get(`${i},${j}`);
    if (list) for (const it of list) out.push(it);
  }
  return out;
}
