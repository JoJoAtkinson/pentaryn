/**
 * Pure motion rules for pentaryn-movement 0.4.0 (plan context/plans/pathfinding-2026-11.md §12–13):
 * where a token is at a given time, when two moving circles come too close, the in-combat cell chain,
 * the wave buckets of a staggered group, and the two decision tables the glue asks (should a drop be
 * group-planned; what does a click on a moving token do). No Foundry globals.
 *
 * Units: positions are token CENTRES in grid squares (1 = one square), times in milliseconds, speeds
 * in squares per second (core's CONFIG.Token.movement.defaultSpeed is 6). A token is a circle of
 * radius max(width, height) / 2 squares.
 */

import { directPath } from "./pathfind-core.mjs";

/** Squares a pair that starts just touching may close in while one leaves (a hair: numeric slack, no visible overlap). */
const TOUCH_SLACK = 0.02;

export const MOTION = Object.freeze({
  restGap: 0.2,          // squares between two circles at rest (slots; 0.1 until 0.5.0: hex rows 0.95 apart walled a
                         // packed room off, with nothing allowed to brush past a resting member)
  motionGap: 0.75,       // latency buffer (squares): a token walking in a different wave may be drawn this far ahead of or
                         // behind itself along its way (~125 ms at 6 squares/s, above the tunnel's 11-105 ms spread;
                         // a flat 0.25 square until 0.5.0)
  contact: 0.15,         // squares two circles that start in contact may brush while one leaves
  delayStep: 150,        // ms: start delays are multiples of this
  maxDelay: 3000,        // ms: the largest start delay tried before a lateral re-plan
  waveMs: 150,           // ms: one batched update per bucket
  chordError: 0.05,      // squares: an arc's chords stay this close to the circle
  cornerPoints: 8,       // points per arc at most
  routePoints: 64,       // points per route at most
  speed: 6,              // squares per second when nothing says otherwise (core's default)
  checkpointEvery: 1,    // in combat, a checkpoint every this many cells
  armMs: 400,            // ms: a click stops a move only once it has run this long (a habit click right after a drop, or a double click to open the sheet, leaves it alone)
});

const EPS = 1e-6;

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** A token's circle radius in squares. */
export const radiusOf = (width = 1, height = width) => Math.max(width, height) / 2;

/* -------------------------------------------- */
/*  Trajectories                                */
/* -------------------------------------------- */

/**
 * A route as a function of time: linear per segment (core tweens each waypoint linearly, no easing),
 * duration = length / speed, a segment's speed divided by its terrain difficulty (capped at 10, as
 * core's _modifyAnimationMovementSpeed does).
 *
 * @param {{x,y}[]} points           centres, start first
 * @param {object} [o]
 * @param {number} [o.speed]         squares per second
 * @param {number} [o.delay]         ms before it starts
 * @param {number[]} [o.difficulty]  per segment, ≥ 1
 */
export function trajectory(points, { speed = MOTION.speed, delay = 0, difficulty = [] } = {}) {
  const pts = points.map(p => ({ x: p.x, y: p.y }));
  const times = [delay];
  let t = delay;
  for (let k = 1; k < pts.length; k++) {
    const d = Math.min(Math.max(difficulty[k - 1] ?? 1, 1), 10);
    const v = speed / d / 1000;                       // squares per ms
    t += dist(pts[k - 1], pts[k]) / v;
    times.push(t);
  }
  return { pts, times, start: delay, end: t };
}

/** The same trajectory, started `delay` ms later than t = 0. */
export function delayed(tr, delay) {
  const shift = delay - tr.start;
  return { pts: tr.pts, times: tr.times.map(t => t + shift), start: delay, end: tr.end + shift };
}

/** Where the token is at time t (at its start before it starts, at its end after it ends). */
export function positionAt(tr, t) {
  const { pts, times } = tr;
  if (t <= times[0] || pts.length === 1) return { ...pts[0] };
  if (t >= times.at(-1)) return { ...pts.at(-1) };
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const span = times[hi] - times[lo];
  const f = span > 0 ? (t - times[lo]) / span : 1;
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * f, y: pts[lo].y + (pts[hi].y - pts[lo].y) * f };
}

/* -------------------------------------------- */
/*  Conflicts                                   */
/* -------------------------------------------- */

/** On [0, T], the squared distance |P + Vτ|² as a·τ² + b·τ + c. */
const quad = (P, V) => ({ a: V.x * V.x + V.y * V.y, b: 2 * (P.x * V.x + P.y * V.y), c: P.x * P.x + P.y * P.y });

/** The earliest τ in [0, T] where the distance is below `lim`, or null. */
function earliestBelow(q, lim, T) {
  if (lim <= 0) return null;
  const c = q.c - lim * lim;
  if (c < 0) return 0;
  if (q.a < 1e-12) {
    if (q.b >= 0) return null;
    const tau = -c / q.b;
    return tau <= T ? tau : null;
  }
  const disc = q.b * q.b - 4 * q.a * c;
  if (disc <= 0) return null;
  const tau = (-q.b - Math.sqrt(disc)) / (2 * q.a);
  return tau >= 0 && tau <= T ? tau : null;
}

/** The earliest τ in [0, T] where the distance is at least `lim`, or null. */
function earliestAtLeast(q, lim, T) {
  const c = q.c - lim * lim;
  if (c >= 0) return 0;
  if (q.a < 1e-12) {
    if (q.b <= 0) return null;
    const tau = -c / q.b;
    return tau <= T ? tau : null;
  }
  const disc = q.b * q.b - 4 * q.a * c;
  const tau = (-q.b + Math.sqrt(Math.max(disc, 0))) / (2 * q.a);
  return tau >= 0 && tau <= T ? tau : null;
}

/** Every time either trajectory changes segment, sorted, from 0 to the later end. */
function breakpoints(A, B) {
  const all = [0, ...A.times, ...B.times].filter(t => t >= 0).sort((x, y) => x - y);
  const out = [];
  for (const t of all) if (!out.length || t - out.at(-1) > EPS) out.push(t);
  return out;
}

const moving = (tr, t0, t1) => t0 >= tr.start - EPS && t1 <= tr.end + EPS && tr.end > tr.start;

/**
 * The first time two circles come too close, or null. Exact for piecewise-linear motion (both move
 * linearly between breakpoints, so the distance is a quadratic there), which covers the plan's
 * "sampled at 50 ms, plus segment-pair closest approach".
 *
 * Required distance, per stretch of time: rA + rB. When both are moving and in different waves (or in combat,
 * where each token's next stretch is its own update), a client may draw either up to `gap` squares ahead of or
 * behind where it is along its own way (the latency buffer, 0.75 square since 0.5.0: about 125 ms at 6 squares
 * per second, above the tunnel's spread): rA + rB must hold with A or B shifted by -gap, -gap/2, gap/2 and gap
 * along its direction (capped by the way it has walked and has left). Symmetric in A and B. Neighbours walking side by side are not pulled apart by it; one walking in another's
 * wake is (0.4.x added a flat 0.25 square instead, in every direction). One batch out of combat starts on every
 * client from the same update and gets no shift.
 * A pair that starts overlapped or in contact (closer than rA + rB + 0.05) is held only to "no closer than it
 * started, less `contact`" (less 0.02 for a pair that starts just touching, S1R2-05; shifted too while both walk) until it first reaches rA + rB + 0.05 (plan §4 step C:
 * ignored until it first separates; grid neighbours brush as one leaves).
 *
 * @returns {{ t: number, d: number } | null}
 */
export function firstConflict(A, B, rA, rB, { sameWave = false, combat = false, gap = MOTION.motionGap,
  contact = MOTION.contact } = {}) {
  const rr = rA + rB;
  let bt = breakpoints(A, B);
  // Where B has walked, or has left, half the buffer and the whole of it: the shift's cap changes there.
  if (gap > 0 && (combat || !sameWave)) {
    const extra = [];
    for (const X of [A, B]) {
      if (!(X.end > X.start)) continue;
      let len = 0;
      for (let k = 1; k < X.pts.length; k++) len += dist(X.pts[k - 1], X.pts[k]);
      const v = len / (X.end - X.start);
      if (v > 1e-12) for (const k of [0.5, 1]) extra.push(X.start + (gap * k) / v, X.end - (gap * k) / v);
      bt = [...bt, ...extra.filter(t => t > X.start && t < X.end)];
      extra.length = 0;
    }
    bt = bt.sort((x, y) => x - y).filter((t, i, all) => i === 0 || t - all[i - 1] > EPS);
  }
  const d0 = dist(positionAt(A, 0), positionAt(B, 0));
  let held = d0 < rr + 0.05;
  // Only a pair that starts overlapped may close in by `contact` as one leaves; one that starts just touching (grid
  // neighbours) keeps to TOUCH_SLACK (S1R2-05: a member walking past the grabbed one waiting beside it grazed it by
  // 11 px, within the 0.15).
  const floor = Math.min(d0, rr) - (d0 < rr - TOUCH_SLACK ? contact : Math.min(contact, TOUCH_SLACK));
  const stretches = [];
  for (let k = 1; k < bt.length; k++) stretches.push([bt[k - 1], bt[k]]);
  stretches.push([bt.at(-1), bt.at(-1)]);           // both at rest at the end
  for (const [t0, t1] of stretches) {
    const T = t1 - t0;
    const a0 = positionAt(A, t0), b0 = positionAt(B, t0);
    const a1 = positionAt(A, t1), b1 = positionAt(B, t1);
    const P = { x: a0.x - b0.x, y: a0.y - b0.y };
    const V = T > 0 ? { x: ((a1.x - a0.x) - (b1.x - b0.x)) / T, y: ((a1.y - a0.y) - (b1.y - b0.y)) / T } : { x: 0, y: 0 };
    const q = quad(P, V);
    const both = T > 0 && moving(A, t0, t1) && moving(B, t0, t1);
    // The latency buffer: either drawn up to `gap` ahead of or behind itself along its way (the same for A and B,
    // so the answer does not depend on which is which).
    const qs = [q];
    if (both && (combat || !sameWave) && gap > 0) {
      for (const [X, p0, p1, sign] of [[B, b0, b1, -1], [A, a0, a1, 1]]) {
        const bx = p1.x - p0.x, by = p1.y - p0.y, L = Math.hypot(bx, by);
        if (L <= 1e-9) continue;
        // Never drawn behind its start or past its end: the shift is capped by the way walked and the way left.
        const v = L / T;
        const back = Math.max((t0 - X.start) * v, 0), ahead = Math.max((X.end - t1) * v, 0);
        for (const k of [-1, -0.5, 0.5, 1]) {
          const d = k < 0 ? -Math.min(gap * -k, back) : Math.min(gap * k, ahead);
          if (Math.abs(d) > 1e-9) qs.push(quad({ x: P.x + sign * (bx / L) * d, y: P.y + sign * (by / L) * d }, V));
        }
      }
    }
    const earliest = (list, lim, span) => {
      let best = null;
      for (const qq of list) { const tau = earliestBelow(qq, lim, span); if (tau !== null && (best === null || tau < best.tau)) best = { tau, qq }; }
      return best;
    };
    let from = 0;
    if (held) {
      const sep = earliestAtLeast(q, rr + 0.05, T);          // separated: no longer in contact
      const closer = earliest(qs, floor, T);
      if (closer !== null && (sep === null || closer.tau < sep)) return hit(t0 + closer.tau, closer.qq, closer.tau);
      if (sep === null) continue;
      held = false;
      from = sep;
    }
    const found = earliest(qs.map(qq => shift(qq, from)), rr - EPS, T - from);
    if (found !== null) return hit(t0 + from + found.tau, found.qq, found.tau);
  }
  return null;
}

/** q(τ) re-based at τ = s. */
function shift(q, s) {
  if (!s) return q;
  return { a: q.a, b: q.b + 2 * q.a * s, c: q.a * s * s + q.b * s + q.c };
}
function hit(t, q, tau) {
  return { t, d: Math.sqrt(Math.max(q.a * tau * tau + q.b * tau + q.c, 0)) };
}

/** The smallest distance between two trajectories over all time (tests and status). */
export function minSeparation(A, B) {
  const bt = breakpoints(A, B);
  let best = dist(positionAt(A, bt.at(-1)), positionAt(B, bt.at(-1)));
  for (let k = 1; k < bt.length; k++) {
    const t0 = bt[k - 1], T = bt[k] - t0;
    const a0 = positionAt(A, t0), b0 = positionAt(B, t0), a1 = positionAt(A, bt[k]), b1 = positionAt(B, bt[k]);
    const P = { x: a0.x - b0.x, y: a0.y - b0.y };
    const V = T > 0 ? { x: ((a1.x - a0.x) - (b1.x - b0.x)) / T, y: ((a1.y - a0.y) - (b1.y - b0.y)) / T } : { x: 0, y: 0 };
    const q = quad(P, V);
    const tau = q.a > 1e-12 ? Math.min(Math.max(-q.b / (2 * q.a), 0), T) : 0;
    best = Math.min(best, Math.sqrt(Math.max(q.a * tau * tau + q.b * tau + q.c, 0)), Math.sqrt(q.c));
  }
  return best;
}

/* -------------------------------------------- */
/*  Waves                                       */
/* -------------------------------------------- */

/** Start delays → batches: [{ at, ids }] in time order, one per waveMs bucket. */
export function waves(delays, waveMs = MOTION.waveMs) {
  const by = new Map();
  for (const [id, delay] of Object.entries(delays)) {
    const at = Math.ceil(Math.max(delay, 0) / waveMs - 1e-9) * waveMs;
    if (!by.has(at)) by.set(at, []);
    by.get(at).push(id);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([at, ids]) => ({ at, ids }));
}

/* -------------------------------------------- */
/*  In combat: the cell chain                   */
/* -------------------------------------------- */

/**
 * Lattice nodes → every cell the route passes through, each step one square (Foundry's direct path
 * between consecutive nodes, which the pathfinder's string pulling already costed square by square).
 * `checkpoint` marks every `every`-th cell and the last one.
 *
 * @param {{i,j}[]} nodes
 * @returns {{ i, j, checkpoint: boolean }[]}
 */
export function cellChain(nodes, every = MOTION.checkpointEvery) {
  const out = [];
  for (let k = 0; k < nodes.length; k++) {
    const cells = k === 0 ? [nodes[0]] : directPath(nodes[k - 1], nodes[k]).slice(1);
    for (const c of cells) out.push({ i: c.i, j: c.j });
  }
  return out.map((c, n) => ({ ...c, checkpoint: n === out.length - 1 || (n > 0 && n % Math.max(every, 1) === 0) }));
}

/* -------------------------------------------- */
/*  Decision tables                             */
/* -------------------------------------------- */

export const GROUP_MAX = 12;

/**
 * How should a drop with these drag contexts be committed? Pure inputs, one row per reason.
 *   plan      group-planned (slots, routes, delays)
 *   straight  ghost / unconstrained out of combat: core's straight lines, rest overlaps nudged
 *   core      core's own updates
 * `enabled`: the setting groupDrags (0.9.0: in a fight too, where "plan" is the fight file, one member at a time;
 * tier C and its fightGroupDrags are gone).
 */
export function groupMode({ enabled = true, members = 0, gridType = 1, direct = false, planned = false,
  waypoints = false, ghost = false, unconstrained = false, combat = false, pathfind = null } = {}) {
  if (members < 2) return { mode: "core", reason: "single" };
  if (!enabled) return { mode: "core", reason: "off" };
  if (members > GROUP_MAX) return { mode: "core", reason: "tooMany" };
  if (gridType !== 1) return { mode: "core", reason: "grid" };
  if (direct) return { mode: "core", reason: "direct" };
  if (planned) return { mode: "core", reason: "planned" };
  if (waypoints) return { mode: "core", reason: "waypoints" };
  if (ghost || unconstrained) return { mode: combat ? "core" : "straight", reason: ghost ? "ghost" : "unconstrained" };
  if (pathfind) return { mode: "core", reason: `pathfind:${pathfind}` };
  return { mode: "plan", reason: null };
}

/**
 * What a left click on a token does to its movement (plan §3):
 *   null       nothing (core's click as usual)
 *   displace   out of combat: put it where it is drawn
 *   stop       in combat, this client started the move: stopMovement()
 *   query      in combat, another user started it: ask that client to stop it
 * `elapsed`: ms since this move started (Infinity when unknown). Under MOTION.armMs the click is
 * core's own: the stop is for a wild detour, not for the click that follows every drop.
 */
export function clickStop({ enabled = true, tool = "select", modifiers = false, canControl = false,
  state = "completed", animating = false, combat = false, initiatorSelf = false, elapsed = Infinity } = {}) {
  if (!enabled || tool !== "select" || modifiers || !canControl) return null;
  const inMotion = state === "pending" || state === "paused" || animating;
  if (!inMotion) return null;
  if (!(elapsed >= MOTION.armMs)) return null;
  if (!combat) return "displace";
  return initiatorSelf ? "stop" : "query";
}

/* -------------------------------------------- */
/*  A wall raised mid-walk (0.4.6, live R6-3)   */
/* -------------------------------------------- */

/** Do segments p–q and a–b meet (a touch counts)? Any units. */
export function segmentsCross(p, q, a, b) {
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  const on = (u, v, w) => Math.min(u.x, v.x) - EPS <= w.x && w.x <= Math.max(u.x, v.x) + EPS
    && Math.min(u.y, v.y) - EPS <= w.y && w.y <= Math.max(u.y, v.y) + EPS;
  return (Math.abs(d1) <= EPS && on(a, b, p)) || (Math.abs(d2) <= EPS && on(a, b, q))
    || (Math.abs(d3) <= EPS && on(p, q, a)) || (Math.abs(d4) <= EPS && on(p, q, b));
}

/**
 * Where a token drawn at `at` is along its route `points` (origin first): the index of the next point it
 * walks to. The nearest segment wins; of two as near (within `near`: a route that doubles back), the earlier.
 * null when the route has no segment, or `at` is within `end` of its end. Both in the route's units (the defaults
 * suit squares; a pixel route passes its own).
 *
 * S3R1-01: until 0.7.1 "as near" was 0.5 of whatever unit, and the comparison ran against the best so far, so a
 * token drawn on an arc's last chord was put back on a chord it had already walked (every chord of a corner's
 * fillet lies within 0.5 square of the next). Its way ahead then began with a straight leg back across the
 * inside of the arc: the guard saw a member that walks round another at touching come 0.10-0.13 inside it
 * (d 0.87-0.90 against a 0.9 limit) and stopped it on 10 of 10 clean funnels; the planner read walkers the same way.
 * @param {{x: number, y: number}[]} points
 * @param {{x: number, y: number}} at
 * @param {{ near?: number }} [o]
 * @returns {number|null}
 */
export function routeAhead(points, at, { near = 0.05, end = 0.5 } = {}) {
  if (!Array.isArray(points) || points.length < 2 || !at) return null;
  const ds = [];
  let min = Infinity;
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k], b = points[k + 1];
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = L2 ? Math.min(Math.max(((at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 1;
    const d = Math.hypot(at.x - (a.x + (b.x - a.x) * t), at.y - (a.y + (b.y - a.y) * t));
    ds.push(d);
    if (d < min) min = d;
  }
  let best = null;
  for (let k = 0; k < ds.length; k++) if (ds[k] <= min + near) { best = k + 1; break; }
  if (best === points.length - 1 && dist(points.at(-1), at) < end) return null;
  return best;
}

/**
 * What is left of a route (`points`, origin first) for a token drawn at `at`: `at`, then the points it has
 * still to reach; null when it is at the end or the route has no segment. Any units.
 */
export function remainingFrom(points, at) {
  const k = routeAhead(points, at);
  if (k === null) return null;
  return [{ x: at.x, y: at.y }, ...points.slice(k).map(p => ({ x: p.x, y: p.y }))];
}

/**
 * Of a route ahead (`from` then `points`), the index in `points` of the first one whose leg crosses the
 * wall a–b, or -1. Centres, any units.
 */
export function firstLegAcross(from, points, a, b) {
  let prev = from;
  for (let k = 0; k < (points?.length ?? 0); k++) {
    if (segmentsCross(prev, points[k], a, b)) return k;
    prev = points[k];
  }
  return -1;
}
