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

export const MOTION = Object.freeze({
  restGap: 0.1,          // squares between two circles at rest (slots)
  motionGap: 0.25,       // squares between two circles both moving in different waves (latency buffer)
  contact: 0.15,         // squares two circles that start in contact may brush while one leaves
  delayStep: 150,        // ms: start delays are multiples of this
  maxDelay: 3000,        // ms: the largest start delay tried before a lateral re-plan
  waveMs: 150,           // ms: one batched update per bucket
  chordError: 0.05,      // squares: an arc's chords stay this close to the circle
  cornerPoints: 8,       // points per arc at most
  routePoints: 64,       // points per route at most
  speed: 6,              // squares per second when nothing says otherwise (core's default)
  checkpointEvery: 1,    // in combat, a checkpoint every this many cells
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
 * Required distance, per stretch of time:
 *   - both moving, and in different waves or in combat:  rA + rB + motionGap  (latency buffer)
 *   - otherwise (one waiting or at rest, or one batch out of combat, which every client starts from
 *     the same update):  rA + rB
 * A pair that starts overlapped or in contact (closer than rA + rB + 0.05) is held only to "no closer
 * than it started, less `contact`" until it first reaches the required distance (plan §4 step C:
 * ignored until it first separates; grid neighbours brush as one leaves).
 *
 * @returns {{ t: number, d: number } | null}
 */
export function firstConflict(A, B, rA, rB, { sameWave = false, combat = false, gap = MOTION.motionGap,
  contact = MOTION.contact } = {}) {
  const rr = rA + rB;
  const bt = breakpoints(A, B);
  const d0 = dist(positionAt(A, 0), positionAt(B, 0));
  let held = d0 < rr + 0.05;
  const floor = Math.min(d0, rr) - contact;
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
    const need = both && (combat || !sameWave) ? rr + gap : rr;
    let from = 0;
    if (held) {
      const sep = earliestAtLeast(q, rr + gap, T);          // separated: clear of the moving distance
      const closer = earliestBelow(q, floor, T);
      if (closer !== null && (sep === null || closer < sep)) return hit(t0 + closer, q, closer);
      if (sep === null) continue;
      held = false;
      from = sep;
    }
    const shifted = shift(q, from);
    const tau = earliestBelow(shifted, need - EPS, T - from);
    if (tau !== null) return hit(t0 + from + tau, shifted, tau);
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
 */
export function groupMode({ enabled = true, members = 0, gridType = 1, direct = false, planned = false,
  waypoints = false, ghost = false, unconstrained = false, combat = false, pathfind = null } = {}) {
  if (!enabled) return { mode: "core", reason: "off" };
  if (members < 2) return { mode: "core", reason: "single" };
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
 */
export function clickStop({ enabled = true, tool = "select", modifiers = false, canControl = false,
  state = "completed", animating = false, combat = false, initiatorSelf = false } = {}) {
  if (!enabled || tool !== "select" || modifiers || !canControl) return null;
  const inMotion = state === "pending" || state === "paused" || animating;
  if (!inMotion) return null;
  if (!combat) return "displace";
  return initiatorSelf ? "stop" : "query";
}
