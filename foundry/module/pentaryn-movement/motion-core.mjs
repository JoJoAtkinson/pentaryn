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

/** Every time either trajectory changes segment, sorted, from 0 to the later end. */
function breakpoints(A, B) {
  const all = [0, ...A.times, ...B.times].filter(t => t >= 0).sort((x, y) => x - y);
  const out = [];
  for (const t of all) if (!out.length || t - out.at(-1) > EPS) out.push(t);
  return out;
}

const moving = (tr, t0, t1) => t0 >= tr.start - EPS && t1 <= tr.end + EPS && tr.end > tr.start;

/** The measure of { τ in [0, T] : q(τ) < lim² } (one stretch of two linear motions). */
function measureBelow(q, lim, T) {
  if (lim <= 0 || !(T > 0)) return 0;
  const c = q.c - lim * lim;
  if (q.a < 1e-12) {
    if (Math.abs(q.b) < 1e-12) return c < 0 ? T : 0;
    const root = Math.min(Math.max(-c / q.b, 0), T);
    return q.b > 0 ? root : T - root;
  }
  const disc = q.b * q.b - 4 * q.a * c;
  if (disc <= 0) return 0;
  const s = Math.sqrt(disc);
  return Math.max(0, Math.min((-q.b + s) / (2 * q.a), T) - Math.max((-q.b - s) / (2 * q.a), 0));
}

/**
 * How long (ms) two trajectories are both moving and closer than `lim` (0.10 L2, R5: a deep, long overlap of two
 * movers holds a pair apart; a crossing on open ground is brief). Exact for piecewise-linear motion.
 */
export function closeTime(A, B, lim) {
  const bt = breakpoints(A, B);
  let total = 0;
  for (let k = 1; k < bt.length; k++) {
    const t0 = bt[k - 1], t1 = bt[k], T = t1 - t0;
    if (!(T > 0) || !moving(A, t0, t1) || !moving(B, t0, t1)) continue;
    const a0 = positionAt(A, t0), b0 = positionAt(B, t0), a1 = positionAt(A, t1), b1 = positionAt(B, t1);
    const P = { x: a0.x - b0.x, y: a0.y - b0.y };
    const V = { x: ((a1.x - a0.x) - (b1.x - b0.x)) / T, y: ((a1.y - a0.y) - (b1.y - b0.y)) / T };
    total += measureBelow(quad(P, V), lim, T);
  }
  return total;
}

/** The nearest a trajectory comes to point `p` while it moves within [t0, t1] (ms), or Infinity when it does not move then. */
export function nearestWhile(tr, p, t0, t1) {
  const lo = Math.max(t0, tr.start), hi = Math.min(t1, tr.end);
  if (!(hi >= lo) || !(tr.end > tr.start)) return Infinity;
  let best = Infinity;
  for (let k = 1; k < tr.pts.length; k++) {
    const s0 = Math.max(lo, tr.times[k - 1]), s1 = Math.min(hi, tr.times[k]);
    if (s1 < s0) continue;
    const a = positionAt(tr, s0), b = positionAt(tr, s1);
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const u = L2 > 1e-12 ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + (b.x - a.x) * u), p.y - (a.y + (b.y - a.y) * u)));
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

/**
 * A group member's walk in a fight (0.10 L3; Joe's leader rule R6 / R7): where it may rest and how far it goes. The
 * walk's squares are k = 0 (its start) .. n − 1 (its square). `free(k)`: may it rest on square k (outside every token
 * at rest: the leader passes through its own members, never rests inside one). `costs[k]`: core's measured cost from
 * its start to square k; `left`: the movement it has left this turn (dnd5e's speed less the movement history's cost;
 * null or not finite: no usable speed, it walks the whole way, as a single drag does). It walks to `end`, the last
 * free square its movement pays for (0: none, it does not move); `checkpoints[k]` (k ≤ end) marks the squares a
 * fight's update may end on (every free one: core commits a fight's walk square by square); `short`: it stops before
 * its own square, `why` "speed"; `paid`: the last square its movement pays for (end ≤ paid: the squares between are
 * inside a member).
 */
export function fightWalk(n, { free = () => true, costs = null, left = null } = {}) {
  const limited = Number.isFinite(left) && Array.isArray(costs);
  const ok = k => { try { return !!free(k); } catch { return false; } };
  let end = 0, paid = 0;
  for (let k = 1; k < n; k++) {
    if (limited && !(costs[k] <= left + EPS)) break;
    paid = k;
    if (ok(k)) end = k;
  }
  const checkpoints = Array.from({ length: end + 1 }, (_, k) => k > 0 && ok(k));
  const short = end < n - 1;
  return { end, paid, checkpoints, short, why: short && limited ? "speed" : null };
}

/**
 * The order one stop of several walkers settles them in (0.10 L3; the simulator's door cuts and clicks of a packed
 * file): the front ones first, so that each one behind, finding the one ahead resting where it is drawn, is carried
 * back along the way it came, where nobody has been rested yet. Of two that overlap where they are drawn, the one
 * walking toward the other (its direction `dir` pointing at it more) is behind it; so of two near each other (closer
 * than touching plus `margin`): a jammed crowd settles front to back, and each one behind can still back off into the
 * room the ones behind it have not taken yet. `items`: [{ id, at, dir, r }] (any units; dir a unit vector, or null when
 * it is not walking). The ids; the given order wherever nothing says otherwise (and for a cycle).
 */
export function stopOrder(items, { margin = 0 } = {}) {
  const n = items.length;
  const before = Array.from({ length: n }, () => []);
  const need = new Array(n).fill(0);
  const toward = (a, b) => (a.dir ? a.dir.x * (b.at.x - a.at.x) + a.dir.y * (b.at.y - a.at.y) : 0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = items[i], B = items[j];
    if (dist(A.at, B.at) >= A.r + B.r + margin - EPS) continue;
    const ta = toward(A, B), tb = toward(B, A);
    if (ta > tb + EPS) { before[j].push(i); need[i] += 1; }        // A walks into B: B first
    else if (tb > ta + EPS) { before[i].push(j); need[j] += 1; }
  }
  const out = [], done = new Array(n).fill(false);
  while (out.length < n) {
    let k = need.findIndex((c, x) => !done[x] && c === 0);
    if (k < 0) k = done.findIndex(d => !d);
    done[k] = true;
    out.push(items[k].id);
    for (const x of before[k]) need[x] -= 1;
  }
  return out;
}

/**
 * The spots along a token's own way a stop may rest it on (0.10 L3 fix round; settleAlong's candidates): where it is
 * drawn, then ahead at most `aheadMax`, then back the way it came at most `behindMax`, every `step`, each where
 * `free(p)` holds, walking no further a way once a wall is between two samples (`wallBetween`) or it would enter a token
 * at rest (`enters(from, p)`), as clearAlong walks. At most `max`. [{ p, via }] (via: the corners passed on the way).
 */
export function spotsAlong({ drawn, ahead, behind, free, wallBetween = null, enters = null, step, aheadMax, behindMax, snap = p => p, max = 200 }) {
  const out = free(drawn) ? [{ p: drawn, via: [] }] : [];
  const along = (list, lim) => {
    const via = [];
    let prev = drawn, walked = 0, last = drawn;
    for (const q of list) {
      const L = Math.hypot(q.x - prev.x, q.y - prev.y);
      const n = Math.max(1, Math.ceil(L / step));
      for (let i = 1; i <= n; i++) {
        walked += L / n;
        if (walked > lim || out.length >= max) return;
        const p = snap({ x: prev.x + ((q.x - prev.x) * i) / n, y: prev.y + ((q.y - prev.y) * i) / n });
        if (wallBetween?.(last, p) || enters?.(drawn, p)) return;
        last = p;
        if (free(p)) out.push({ p, via: [...via] });
      }
      via.push(snap({ x: q.x, y: q.y }));
      prev = q;
    }
  };
  along(ahead, aheadMax);
  along(behind, behindMax);
  return out;
}

/** The least distance from `p` to the polyline `path`. */
function pathDist(p, path) {
  if (path.length === 1) return dist(p, path[0]);
  let best = Infinity;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = L2 ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t)));
  }
  return best;
}

/**
 * One stop of several tokens settled together (0.10 L3 fix round: the simulator's jams, a crowd stopped in a door,
 * and a walk on carried through a token the same stop then rested on its way): each takes one of its own spots
 * (`cands`, spotsAlong's, its best first), so that no two rest inside each other and no walk on passes through a
 * token at rest at its end (one setting off from inside another is leaving it: `leave`; the leader of a group passes
 * through its own members, `mates`). The tokens in the order given (the stop's: the front ones first) keep their best
 * spot wherever the ones after them can still be settled; conflict-directed backjumping, at most `budget` tries.
 * `items`: [{ id, r, drawn, cands: [{ p, via }], mates? }] (any units). A Map id → { p, via }, or null (none found).
 */
export function settleAlong(items, { budget = 40000, eps = 0.01, leave = 0.05 } = {}) {
  const n = items.length;
  if (items.some(it => !it.cands?.length)) return null;
  const paths = items.map(it => it.cands.map(c => [it.drawn, ...c.via, c.p]));
  const through = (i, a, j, b) => {
    const I = items[i], J = items[j], q = J.cands[b].p, rr = I.r + J.r;
    if (I.mates?.has(J.id) || paths[i][a].length < 2) return false;
    if (dist(I.drawn, q) < rr - leave) return false;          // it sets off from inside J's spot: leaving it
    return pathDist(q, paths[i][a]) < rr - eps;
  };
  const fits = (i, a, j, b) => dist(items[i].cands[a].p, items[j].cands[b].p) >= items[i].r + items[j].r - eps
    && !through(i, a, j, b) && !through(j, b, i, a);
  const pick = new Array(n).fill(-1);
  let work = 0;
  const solve = k => {
    if (k === n) return { ok: true };
    const conf = new Set();
    for (let a = 0; a < items[k].cands.length; a++) {
      if (++work > budget) return { ok: false, conf: null };
      let bad = -1;
      for (let j = 0; j < k && bad < 0; j++) if (!fits(k, a, j, pick[j])) bad = j;
      if (bad >= 0) { conf.add(bad); continue; }
      pick[k] = a;
      const r = solve(k + 1);
      if (r.ok || !r.conf) return r;
      if (!r.conf.has(k)) return r;                           // k is not what stops the ones after it: jump back
      for (const x of r.conf) if (x !== k) conf.add(x);
    }
    return { ok: false, conf };
  };
  if (!solve(0).ok) return null;
  return new Map(items.map((it, k) => [it.id, it.cands[pick[k]]]));
}

/**
 * Is this wall update a door going to shut (0.10 L3 ruling, seed 6142)? `src`: the wall's source now; `changes`: the
 * update. A door (door > 0) that blocks movement, open now (Foundry's ds 1), set to any other state.
 */
export function doorShutting(src, changes) {
  if (!src || !changes || !("ds" in changes)) return false;
  if (!(Number(src.door) > 0) || !(Number(changes.move ?? src.move) > 0)) return false;
  return Number(src.ds) === 1 && Number(changes.ds) !== 1;
}

/**
 * Would a door shut leave one of the walkers crossing it with no rest spot (0.10 L3 ruling, seed 6142)? `items`: the
 * walkers the door's cut would stop, the nearest the door first, as settleAlong takes them (`cands`: each one's spots
 * along its own way with the door shut, spotsAlong's). The id of the first with no spot at all, else of the first when
 * they cannot all be settled clear of each other; null when they can (the shut may go).
 */
export function shutBlocked(items, opts = {}) {
  if (!items?.length) return null;
  const none = items.find(it => !it.cands?.length);
  if (none) return none.id;
  return settleAlong(items, opts) ? null : items[0].id;
}

/* -------------------------------------------- */
/*  Decision tables                             */
/* -------------------------------------------- */

/** The most members a group drag takes, out of combat and in a fight (0.10 R11: 24, was 12). */
export const GROUP_MAX = 24;

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
 * Does a one-way wall let a move from `origin` through (0.10 L2 fix (d))? Foundry's own reading (Edge#orientPoint and
 * the polygon's wall inclusion): a wall with a direction (dir 1 LEFT, 2 RIGHT) blocks only a move that starts on the
 * other side of it; a move from the side it names, or a wall with no direction (0, BOTH), and a start on its line, do
 * not pass. `c` is the wall's [x0, y0, x1, y1]; any units.
 */
export function wallOpenFrom(c, dir, origin) {
  const d = Number(dir);
  if (!(d === 1 || d === 2) || !Array.isArray(c) || c.length < 4 || !origin) return false;
  const o = (c[1] - origin.y) * (c[2] - origin.x) - (c[0] - origin.x) * (c[3] - origin.y);
  if (Math.abs(o) < 1e-9) return false;
  return (o < 0 ? 1 : 2) === d;
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

/* -------------------------------------------- */
/*  A stop's spot along its own way (0.9.0)     */
/* -------------------------------------------- */

/**
 * Where a stop out of combat carries a token whose drawn spot is no place to rest (stop.mjs pastDoor; 0.9.0 simulator,
 * step 5): the first point along its own way ahead (at most `aheadMax`), else back along the way it came (at most
 * `behindMax`), sampled every `step`, that is not `bad` (across a door's line, inside a token at rest) and not `taken`
 * (a token still walking there: on past it), never past a point `wallBetween` refuses. Units are the caller's.
 * @param {{x,y}} drawn
 * @param {{x,y}[]} ahead     the way ahead, its corners after `drawn`
 * @param {{x,y}[]} behind    the way it came, nearest corner first
 * @param {object} o
 * @param {(p) => boolean} o.bad
 * @param {(p) => boolean} [o.taken]
 * @param {(a, b) => boolean} [o.wallBetween]  true: a wall that blocks movement now lies between a and b
 * @param {(from, p) => boolean} [o.enters]   true: at p it is inside a token at rest it was not inside at `from`
 *        (`drawn`): it would walk through that token, so no further that way (0.9.0 simulator, seed 6156)
 * @param {number} o.step  @param {number} o.aheadMax  @param {number} o.behindMax
 * @param {(p) => {x,y}} [o.snap]  how a sample is placed (stop.mjs: whole pixels)
 * @returns {{ p: {x,y}, via: {x,y}[] } | null}  via: the corners passed on the way
 */
export function clearAlong(drawn, ahead, behind, { bad, taken = null, wallBetween = null, enters = null, step, aheadMax, behindMax, snap = p => p }) {
  const along = (list, max) => {
    const via = [];
    let prev = drawn, walked = 0, last = drawn;
    for (const q of list) {
      const L = Math.hypot(q.x - prev.x, q.y - prev.y);
      const n = Math.max(1, Math.ceil(L / step));
      for (let i = 1; i <= n; i++) {
        walked += L / n;
        if (walked > max) return null;
        const p = snap({ x: prev.x + ((q.x - prev.x) * i) / n, y: prev.y + ((q.y - prev.y) * i) / n });
        if (wallBetween?.(last, p) || enters?.(drawn, p)) return null;
        last = p;
        if (!bad(p) && !taken?.(p)) return { p, via };
      }
      via.push(snap({ x: q.x, y: q.y }));
      prev = q;
    }
    return null;
  };
  return along(ahead, aheadMax) ?? along(behind, behindMax);
}
