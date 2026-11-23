/**
 * Pure group planning for pentaryn-movement 0.4.0 (plan context/plans/pathfinding-2026-11.md §12
 * "Group planning algorithm", deviations in §13). No Foundry globals.
 *
 * Units as motion-core.mjs: centres in grid squares, ms, squares per second. The Foundry side
 * (group-adapter.mjs, group.mjs) supplies the oracles:
 *
 *   walkable(member, c)        can that member stand with its centre at c (walls, scene edge)?
 *   walkDistance(c)            walking distance from the anchor's destination to c, or null (flood)
 *   route(member, from, to, { avoid })   { points: [{x,y}], length, data? } or null; `avoid` (circles, squares)
 *                              is hard: the standing tokens (crowdFor, 0.5.0) and, in a re-plan, rest spots
 *   toward(member, from, to)   the way that ignores the tokens ({ points, length, data? }; a big one's as far as its
 *                              body fits) or null: a member with no route walks it as far as it is free (0.5.0)
 *   cramped(c, r)              (optional) is a token of radius r at c in a one-wide corridor or a doorway (no rest there when cut short)?
 *   narrow(points, rmax)       the points where the anchor's route passes a gap narrower than 2 group
 *                              diameters, in route order ([] when it never does)
 *   now()                      clock (ms), for the budget
 *
 * planGroup() is a generator: it yields after every route call (the expensive step), so the glue
 * can run it in time slices and give up past the budget (runPlan()).
 */

import { MOTION, dist, firstConflict, trajectory, delayed, GROUP_MAX } from "./motion-core.mjs";

/** A way round may add this many squares, or half the direct way, whichever is more (H2-02, H3-03). */
export const DETOUR_SQUARES = 4;
/** Is a way round (`round` squares) a detour nobody wants, against the direct way (`direct` squares)? */
export function detourTooLong(direct, round) {
  if (!Number.isFinite(direct) || !Number.isFinite(round)) return false;
  return round > direct + Math.max(DETOUR_SQUARES, direct / 2);
}

export const GROUP_LIMITS = Object.freeze({
  maxMembers: GROUP_MAX,
  memberMs: 400,       // one member's routes, all tries (planning time: the clock runs only while the plan does)
  totalMs: 2500,       // the whole plan's planning time: past this the drop is core's (1200 until 0.4.11: a slow tab fell back, live H4-02)
  waitMs: 5000,        // the silent wait on the wall clock (slices and the frames between them): past this, core's
  syncMs: 30,          // what the drop spends synchronously before going async
  rings: 5,            // candidate rings around the anchor
  walkRatio: 2,        // a slot's walk distance ≤ this × its straight distance (no slots through a wall)
  walkSlack: 0.75,     // squares added to that bound (the flood is on whole cells)
});

const EPS = 1e-6;
/** A member bigger than one square (2×2 and up): out of combat too it rests on whole squares. */
const isBig = m => (m.w ?? 1) > 1 || (m.h ?? 1) > 1;
/** How many clear spots a grabbed token dropped on another token tries a route to (H1-08). */
const ANCHOR_TRIES = 4;
/** How far (rings of half a square) a grabbed token dropped on another token looks for a clear spot. */
const ANCHOR_RINGS = 10;
/** How many other spots a member blocked by those resting round its own spot tries a route to (0.5.0). */
const RESLOT_TRIES = 3;

/* -------------------------------------------- */
/*  Candidates                                  */
/* -------------------------------------------- */

/** A hex lattice around `c` (c excluded), ring by ring, `pitch` apart. */
export function hexCandidates(c, pitch, rings = GROUP_LIMITS.rings) {
  const out = [];
  const dirs = [[1, 0], [0.5, Math.sqrt(3) / 2], [-0.5, Math.sqrt(3) / 2], [-1, 0], [-0.5, -Math.sqrt(3) / 2], [0.5, -Math.sqrt(3) / 2]];
  for (let k = 1; k <= rings; k++) {
    // Start at ring k on direction 4, walk k steps along each of the six sides.
    let x = c.x + dirs[4][0] * pitch * k, y = c.y + dirs[4][1] * pitch * k;
    for (let side = 0; side < 6; side++) {
      for (let s = 0; s < k; s++) {
        out.push({ x, y });
        x += dirs[side][0] * pitch;
        y += dirs[side][1] * pitch;
      }
    }
  }
  return out;
}

/** Whole-square offsets of a top-left `tl` for a token `w` squares wide, as centres, nearest first. */
export function cellCandidates(tl, w = 1, h = w, rings = GROUP_LIMITS.rings) {
  const out = [];
  for (let dy = -rings; dy <= rings; dy++) for (let dx = -rings; dx <= rings; dx++) {
    if (!dx && !dy) continue;
    out.push({ x: tl.x + dx + w / 2, y: tl.y + dy + h / 2, d: Math.max(Math.abs(dx), Math.abs(dy)) });
  }
  return out.sort((a, b) => a.d - b.d).map(({ x, y }) => ({ x, y }));
}

/* -------------------------------------------- */
/*  Step A: slots                               */
/* -------------------------------------------- */

/**
 * How far along a polyline a point lies (arc length of its nearest point; past the last segment the
 * line runs on, before the first it runs back), in squares. "Depth" along the anchor's route.
 */
export function alongRoute(points, c) {
  if (points.length < 2) return 0;
  let best = Infinity, at = 0, run = 0;
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1], q = points[k];
    const L = dist(p, q);
    if (L < EPS) continue;
    let t = ((c.x - p.x) * (q.x - p.x) + (c.y - p.y) * (q.y - p.y)) / (L * L);
    if (k > 1) t = Math.max(t, 0);
    if (k < points.length - 1) t = Math.min(t, 1);
    const off = Math.hypot(c.x - (p.x + (q.x - p.x) * t), c.y - (p.y + (q.y - p.y) * t));
    if (off < best - EPS) { best = off; at = run + t * L; }
    run += L;
  }
  return at;
}

/** Distance from c to the polyline. */
export function offRoute(points, c) {
  let best = points.length ? dist(points[0], c) : Infinity;
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1], q = points[k];
    const L2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    const t = L2 ? Math.min(Math.max(((c.x - p.x) * (q.x - p.x) + (c.y - p.y) * (q.y - p.y)) / L2, 0), 1) : 0;
    best = Math.min(best, Math.hypot(c.x - (p.x + (q.x - p.x) * t), c.y - (p.y + (q.y - p.y) * t)));
  }
  return best;
}

/**
 * Rest positions. The anchor's is its drop point, final. The formation (every member's same-delta
 * destination) is kept when every spot is walkable, reachable, clear of other tokens and no two
 * overlap; otherwise members are assigned greedily to the formation spot or a lattice candidate
 * (pairwise ≥ r1 + r2 + gap):
 *   - open ground: largest first, each to the candidate nearest its formation spot;
 *   - constricted (the anchor's route passes a narrow gap): in file order (`rank`, front first). The
 *     members ahead of the anchor get the slots just deeper than it, the ones behind the slots just
 *     shallower, each deeper than the next (`depthOf`: distance along the anchor's route), so nobody
 *     has to pass anybody.
 *
 * @param {object} spec
 * @param {{ id, r, w, h, start, formation, tl? }[]} spec.members
 * @param {string} spec.anchorId
 * @param {{x,y,r}[]} [spec.others]      circles of tokens outside the group (and excluded members' end points)
 * @param {string[]} [spec.rank]         constricted: member ids, front of the file first
 * @param {(c) => number} [spec.depthOf] constricted: depth of a point along the anchor's route
 * @param {{x,y}[]} [spec.route]         constricted: the anchor's route
 * @param {{x,y}[]} [spec.narrowPts]     constricted: its narrow points; a spot beside them (not on the
 *                                       route) would block the gap's mouth for whoever comes after
 * @param {(c) => boolean} [spec.openAt] constricted: is there room around c (not itself in a narrow place)?
 * @param {boolean} [spec.anchorLast]    constricted: the anchor rests in the gap's mouth and goes last, so every
 *                                       other member takes a spot past it (0.5.0: it would plug the gap for them)
 * @returns {{ slots: Object<string,{x,y}>, formation: boolean, reslotted: string[], missing: string[] }}
 */
export function assignSlots({ members, anchorId, walkable, walkDistance, others = [], constricted = false,
  combat = false, gap = MOTION.restGap, rings = GROUP_LIMITS.rings, rank = null, depthOf = null,
  route = null, narrowPts = [], openAt = null, anchorLast = false }) {
  const anchor = members.find(m => m.id === anchorId);
  const rmax = Math.max(...members.map(m => m.r));
  const reach = c => {
    const wd = walkDistance(c);
    if (wd === null || wd === undefined) return null;
    return wd <= GROUP_LIMITS.walkRatio * dist(c, anchor.formation) + GROUP_LIMITS.walkSlack ? wd : null;
  };
  const clearOfOthers = (m, c) => others.every(o => dist(c, o) >= m.r + o.r - EPS);
  const valid = (m, c) => walkable(m, c) && clearOfOthers(m, c) && reach(c) !== null;
  const apart = (m, c, placed) => placed.every(p => dist(c, p.c) >= m.r + p.r + gap - EPS);

  // Keep the formation? (Its spots only need not to overlap: a grid formation is circles touching.)
  // Not through a narrow gap: a formation spot just past the gap would plug it for the rest (§13).
  const rest = members.filter(m => m.id !== anchorId);
  const keep = !(constricted && rank && depthOf) && rest.every(m => valid(m, m.formation))
    && members.every((m, i) => members.slice(i + 1).every(n => dist(m.formation, n.formation) >= m.r + n.r - EPS));
  const slots = { [anchorId]: { ...anchor.formation } };
  if (keep) {
    for (const m of rest) slots[m.id] = { ...m.formation };
    return { slots, formation: true, reslotted: [], missing: [] };
  }

  const placed = [{ c: anchor.formation, r: anchor.r }];
  const hex = combat ? null : hexCandidates(anchor.formation, 2 * rmax + gap, rings);
  const reslotted = [], missing = [];
  // A big member (2×2 and up) rests on whole squares out of combat too (live H2-01): the route search's lattice
  // is anchored on the goal, so a hex slot put a Large's centre 32 px off the middle of a 2-wide double door,
  // where its body no longer fits, and its route was refused.
  const tl0 = anchor.tl ?? { x: anchor.formation.x - anchor.w / 2, y: anchor.formation.y - anchor.h / 2 };
  const cellTl = { x: Math.round(tl0.x), y: Math.round(tl0.y) };
  const latticeFor = m => (combat || isBig(m)
    ? cellCandidates(combat ? tl0 : cellTl, m.w, m.h, rings)
    : hex);
  /** Place m on the candidate with the smallest key (null = not allowed); false when none. */
  const place = (m, key) => {
    let best = null, bestKey = Infinity;
    for (const c of [m.formation, ...latticeFor(m)]) {
      if (!apart(m, c, placed) || !valid(m, c)) continue;
      const k = key(c);
      if (k === null) continue;
      if (k < bestKey - EPS) { best = c; bestKey = k; }
    }
    if (!best) return false;
    slots[m.id] = { x: best.x, y: best.y };
    placed.push({ c: best, r: m.r });
    if (dist(best, m.formation) > EPS) reslotted.push(m.id);
    return true;
  };
  const near = m => c => dist(c, m.formation);

  if (constricted && rank && depthOf) {
    // The pack: the spots nearest the anchor, one per member (valid for the largest member, so any
    // member fits). Then in file order, front first, each member takes the deepest spot left (nearest
    // its own formation spot among equals): the first through goes furthest, nobody rests in the way.
    // Members ahead of the anchor in the file take spots at least as deep as it, those behind spots no
    // deeper (within one radius: beside it counts as both).
    // The pool is for the members of up to one square; a big one takes its own whole-square spot after them.
    const small = members.filter(m => !isBig(m));
    const big = (small.length ? small : members).reduce((a, b) => (b.r > a.r ? b : a));
    const byId = new Map(members.map(m => [m.id, m]));
    const bigs = combat ? [] : members.filter(m => m.id !== anchorId && isBig(m));
    const file = rank.map(id => byId.get(id)).filter(m => m && !bigs.includes(m));
    // The anchor resting in the gap's mouth goes last (0.5.0): every other member is "ahead" of it and rests deeper.
    const ia = anchorLast ? file.length : Math.max(file.indexOf(anchor), 0);
    const ahead = file.slice(0, ia).filter(m => m !== anchor), behind = anchorLast ? [] : file.slice(ia + 1);
    const base = depthOf(anchor.formation);
    const ring = (combat ? latticeFor(big) : hex).slice().sort((a, b) => dist(a, anchor.formation) - dist(b, anchor.formation)
      || depthOf(b) - depthOf(a));
    const taken = [];
    // In the gap or at its mouth, a resting member narrows it for the rest: such spots are used only
    // when the open ones run out (a corridor), and then only on the route itself, never beside it.
    const nearGap = c => narrowPts.some(p => dist(c, p) < big.r + rmax - EPS);
    const mouth = c => nearGap(c) && !!route && offRoute(route, c) > 0.05;
    // Past the gap along the anchor's route (where the anchor itself rests).
    const end = route && narrowPts.length ? alongRoute(route, narrowPts.at(-1)) : -Infinity;
    const past = c => !route || alongRoute(route, c) > end + EPS;
    const roomy = c => !openAt || openAt(c);
    const poolOf = (count, ok) => {
      const pool = [];
      // Tier 1: open floor past the gap (room to walk round, so depth does not matter); tier 2: the
      // gap itself, on the route, in depth order (a corridor).
      for (const tier of [c => !nearGap(c) && past(c) && roomy(c), c => !mouth(c) && ok(depthOf(c))]) {
        for (const c of ring) {
          if (pool.length >= count) break;
          if (!tier(c) || taken.includes(c) || pool.includes(c) || !valid(big, c) || !apart(big, c, placed)
            || ![...taken, ...pool].every(p => dist(c, p) >= 2 * big.r + gap - EPS)) continue;
          pool.push(c);
        }
      }
      taken.push(...pool);
      return pool;
    };
    const pools = [[ahead, poolOf(ahead.length, d => d >= base - rmax - EPS)],
      [behind, poolOf(behind.length, d => d <= base + rmax + EPS)]];
    for (const [group, pool] of pools) for (const m of group) {
      let best = null;
      for (const c of pool) {
        if (!apart(m, c, placed) || !valid(m, c)) continue;
        if (!best || depthOf(c) > depthOf(best) + EPS
          || (Math.abs(depthOf(c) - depthOf(best)) <= EPS && dist(c, m.formation) < dist(best, m.formation))) best = c;
      }
      if (best) {
        pool.splice(pool.indexOf(best), 1);
        slots[m.id] = { x: best.x, y: best.y };
        placed.push({ c: best, r: m.r });
        reslotted.push(m.id);
      } else if (!place(m, near(m))) missing.push(m.id);
    }
    for (const m of bigs) if (!place(m, near(m))) missing.push(m.id);
    return { slots, formation: false, reslotted, missing };
  }

  const order = [...rest].sort((a, b) => b.r - a.r
    || dist(a.formation, anchor.formation) - dist(b.formation, anchor.formation) || (a.id < b.id ? -1 : 1));
  for (const m of order) if (!place(m, near(m))) missing.push(m.id);
  return { slots, formation: false, reslotted, missing };
}

/* -------------------------------------------- */
/*  Step C: timing                              */
/* -------------------------------------------- */

/** Every start delay tried, in order. */
export function delaySteps(max = MOTION.maxDelay, step = MOTION.delayStep) {
  const out = [];
  for (let d = 0; d <= max + EPS; d += step) out.push(d);
  return out;
}

/**
 * Conflict answers per pair of routes (their point arrays) and relative start (live H2-04: on a slow tab a
 * six-member funnel spent 650 ms of a plan in the timing passes alone, asking the same pairs at the same
 * relative delays pass after pass, and fell back to core). A pair whose routes never come within reach of
 * each other (bounding boxes) is clear without a look.
 */
const pairMemo = new WeakMap();
const boxMemo = new WeakMap();
function boxOf(pts) {
  let b = boxMemo.get(pts);
  if (!b) {
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of pts) { b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y); }
    boxMemo.set(pts, b);
  }
  return b;
}
function conflicts(mine, r, f, combat, sameWave) {
  const a = boxOf(mine.pts), b = boxOf(f.tr.pts);
  const reach = r + f.r + MOTION.motionGap;
  if (a.x0 - reach > b.x1 || b.x0 - reach > a.x1 || a.y0 - reach > b.y1 || b.y0 - reach > a.y1) return false;
  let inner = pairMemo.get(mine.pts);
  if (!inner) { inner = new WeakMap(); pairMemo.set(mine.pts, inner); }
  let m = inner.get(f.tr.pts);
  if (!m) { m = new Map(); inner.set(f.tr.pts, m); }
  const key = `${Math.round((mine.start - f.tr.start) * 1000)}|${r}|${f.r}|${combat ? 1 : 0}|${sameWave ? 1 : 0}`;
  let v = m.get(key);
  if (v === undefined) { v = firstConflict(mine, f.tr, r, f.r, { combat, sameWave }) !== null; m.set(key, v); }
  return v;
}

/** The fixed trajectories `tr` (delay 0 shape) conflicts with at `delay`, or [] when clear. */
function conflictsAt(tr, r, delay, fixed, combat) {
  const mine = delayed(tr, delay);
  const wave = Math.ceil(delay / MOTION.waveMs - 1e-9);
  return fixed.filter(f => conflicts(mine, r, f, combat, f.wave === wave));
}

/** One trajectory per route point array (the passes ask the same routes again). */
const trMemo = new WeakMap();
function trajectoryOf(points, speed) {
  let byS = trMemo.get(points);
  if (!byS) { byS = new Map(); trMemo.set(points, byS); }
  if (!byS.has(speed)) byS.set(speed, trajectory(points, { speed }));
  return byS.get(speed);
}

/**
 * Would any of `mine` (members about to set off now: { points (centres, squares), r, speed }) meet one of `walkers`
 * (tokens outside the group walking now: { points: the rest of their walk from where they are drawn, r, speed })?
 * Both from now (HX1-02: two players dragged opposite groups through a one-wide corridor at the same moment; each
 * plan was made before the other group moved, and their later waves walked into each other, -49 to -96 px).
 */
export function walkersMeet(mine, walkers, { combat = false } = {}) {
  // A walker's `delay` (ms from now, 0.6.0): a reservation's member that sets off later (it stands at its start
  // until then), or one that set off earlier (negative: it is part way along).
  const ws = (walkers ?? []).filter(f => f.points?.length >= 2)
    .map(f => ({ r: f.r, tr: trajectory(f.points, { speed: f.speed ?? MOTION.speed, delay: f.delay ?? 0 }) }));
  if (!ws.length) return false;
  for (const m of mine ?? []) {
    if (!(m.points?.length >= 2)) continue;
    const tr = trajectory(m.points, { speed: m.speed ?? MOTION.speed, delay: m.delay ?? 0 });
    if (ws.some(f => firstConflict(tr, f.tr, m.r, f.r, { combat }) !== null)) return true;
  }
  return false;
}

/** The smallest delay with no conflict, or null. */
function firstFreeDelay(tr, r, fixed, combat) {
  for (const d of delaySteps()) if (!conflictsAt(tr, r, d, fixed, combat).length) return d;
  return null;
}

/** The smallest delay from `from` (a delay step) up to twice the delay cap past it with no conflict, or null. */
function freeDelayFrom(tr, r, fixed, combat, from) {
  for (let d = from; d <= from + 2 * MOTION.maxDelay + EPS; d += MOTION.delayStep) if (!conflictsAt(tr, r, d, fixed, combat).length) return d;
  return null;
}

/* -------------------------------------------- */
/*  Hard obstacles (0.5.0)                      */
/* -------------------------------------------- */

/**
 * The circles a member's route keeps out of: every standing token's circle grown by the member's radius (its
 * centre may come no nearer), except one it starts or ends on (0.5.0: standing tokens are hard obstacles for
 * every route, in a fight too; there is no way back to the route through them).
 */
export function crowdFor(m, from, to, others = []) {
  return (others ?? []).map(c => ({ x: c.x, y: c.y, r: c.r + m.r }))
    .filter(c => dist(c, from) >= c.r - EPS && dist(c, to) >= c.r - EPS);
}

/** Is centre c a whole-square position for a w×h token (a fight rests on whole cells only)? */
export const onCell = (c, w = 1, h = w) => [c.x - w / 2, c.y - h / 2].every(v => Math.abs(v - Math.round(v)) < 1e-6);

/**
 * A route cut short: its points up to segment k at fraction t (t = 0: at point k; t = 1: at point k + 1).
 * A null cut is the whole route.
 */
export function prefixOf(points, cut) {
  if (!cut || !Array.isArray(points)) return points;
  const { k, t } = cut;
  if (k >= points.length - 1) return points;
  if (t >= 1 - EPS) return points.slice(0, k + 2);
  const head = points.slice(0, k + 1);
  if (t <= EPS) return head;
  const a = points[k], b = points[k + 1];
  return [...head, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }];
}

/** A cut `inner` of prefixOf(points, outer), as a cut of points itself. */
export function composeCut(outer, inner) {
  if (!outer) return inner ?? null;
  if (!inner) return outer;
  if (inner.k === outer.k && outer.t > EPS && outer.t < 1 - EPS) return { k: inner.k, t: inner.t * outer.t };
  return inner;
}

/** Length of a polyline (squares). */
export function pathLength(points) {
  let L = 0;
  for (let k = 1; k < (points?.length ?? 0); k++) L += dist(points[k - 1], points[k]);
  return L;
}

/**
 * Where a polyline (centres, squares) first comes inside one of `circles` for a token of radius r: { k, t } on
 * segment k, or null when it never does. A circle the token starts on (an overlap already there) is left out.
 */
export function firstIntrusion(points, r, circles) {
  if (!circles?.length || !(points?.length >= 2)) return null;
  const live = circles.filter(c => dist(points[0], c) >= r + c.r - EPS);
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k], b = points[k + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const A = dx * dx + dy * dy;
    let best = null;
    for (const c of live) {
      const R = r + c.r - EPS;
      const px = a.x - c.x, py = a.y - c.y;
      const C = px * px + py * py - R * R;
      if (C < 0) { best = 0; break; }
      if (A < 1e-12) continue;
      const B = 2 * (px * dx + py * dy);
      const disc = B * B - 4 * A * C;
      if (disc <= 0) continue;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t >= 0 && t <= 1 && (best === null || t < best)) best = t;
    }
    if (best !== null) return { k, t: best };
  }
  return null;
}

/**
 * The furthest point at or before { k, t } along `points` a token may rest on: out of combat a hair before it;
 * with `allowed` (a fight: whole cells) the last point it accepts, a route point always counting. A cut;
 * { k: 0, t: 0 } is the start (it does not move).
 */
function backOff(points, { k, t }, allowed, step = 0.25, restOk = null) {
  const at = (a, b, tt) => ({ x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt });
  const ok = c => !restOk || restOk(c);
  for (let j = Math.min(k, points.length - 2); j >= 0; j--) {
    const a = points[j], b = points[j + 1];
    const L = dist(a, b);
    if (L < EPS) continue;
    const top = j === k ? t : 1;
    if (!allowed) {
      // A hair before the hit, else (S1R1-02: not at rest in a one-wide corridor) a step at a time further back.
      for (let tt = Math.max(top - 0.01 / L, 0); tt > EPS; tt -= step / L) if (ok(at(a, b, tt))) return { k: j, t: tt };
      continue;
    }
    const n = Math.max(1, Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
    for (let q = Math.floor(top * n + EPS); q >= 1; q--) {
      const tt = q / n;
      if (((q === n && top >= 1 - EPS) || allowed(at(a, b, tt))) && ok(at(a, b, tt))) return { k: j, t: tt };
    }
  }
  return { k: 0, t: 0 };
}

/**
 * "No route" (0.5.0): the way that ignores the tokens standing in it, walked only as far as it is free of them,
 * where the token may rest (`allowed`: in a fight a whole cell). { cut, points, full }: full when it never meets one.
 */
export function freePrefix(points, r, circles, { allowed = null, restOk = null } = {}) {
  const hit = firstIntrusion(points, r, circles);
  const ok = restOk ? c => restOk(c, r) : null;
  if (!hit) {
    // A way that ends where it may not rest (S1R1-07: a big one's way as far as its body fits ends off the grid):
    // back to the last point it may.
    if (!allowed || points.length < 2 || allowed(points.at(-1))) return { cut: null, points, full: true };
    const cut = backOff(points, { k: points.length - 2, t: 1 - 1e-5 }, allowed, 0.25, ok);
    return { cut, points: prefixOf(points, cut), full: false };
  }
  const cut = backOff(points, hit, allowed, 0.25, ok);
  return { cut, points: prefixOf(points, cut), full: false };
}

/**
 * The plan's last word (0.5.0): no member's walk, wait or rest comes too close to a token standing outside the
 * group, a token walking now, or another member (firstConflict's rules), at any time. While a conflict is left the
 * lower-priority member of the pair (later in `list`; the one that walks when the other stands still; never
 * `keep` when the other walks too) is cut back along its own way to the furthest point from which nothing meets
 * it, its start delay kept; with no such point it stays where it stands. Each round shortens one walk, so it ends;
 * past the round cap every member still in a conflict stays. A member standing still never meets a token walking
 * now (that one's own planner answers for it).
 *
 * @param {{ id, r, w?, h?, speed?, points: {x,y}[], cut?: {k,t}|null, delay: number }[]} list   priority order
 * @param {object} [o]
 * @param {{x,y,r,id?}[]} [o.statics]      tokens standing outside the group
 * @param {{id,r,points,speed?}[]} [o.walkers]  tokens outside the group walking now (the rest of their walk)
 * @param {boolean} [o.combat]
 * @param {(m) => ((c) => boolean)|null} [o.allowedFor]   where a member may rest (a fight: whole cells)
 * @param {string} [o.keep]                the grabbed one: cut last
 * @param {(c, r) => boolean} [o.restOk]  may a member (radius r) cut short rest at c (not in a one-wide corridor or a doorway)?
 * @returns {Generator<string, Map<string, { cut, delay, points, still, changed }>>}
 */
export function* settle(list, { statics = [], walkers = [], combat = false, allowedFor = () => null, keep = null, restOk = null } = {}) {
  const cur = list.map(m => ({ ...m, cut: m.cut ?? null, changed: false }));
  const build = e => {
    e.pts = prefixOf(e.points, e.cut);
    e.tr = delayed(trajectory(e.pts, { speed: e.speed ?? MOTION.speed }), e.delay ?? 0);
    e.wave = Math.ceil((e.delay ?? 0) / MOTION.waveMs - EPS);
    e.still = e.pts.length < 2 || e.tr.end <= e.tr.start + EPS;
    return e;
  };
  cur.forEach(build);
  const fixed = [
    ...(statics ?? []).map(c => ({ id: c.id ?? null, r: c.r, tr: trajectory([{ x: c.x, y: c.y }]), still: true, foreign: true })),
    ...(walkers ?? []).filter(w => w.points?.length >= 2)
      .map(w => ({ id: w.id ?? null, r: w.r, tr: trajectory(w.points, { speed: w.speed ?? MOTION.speed, delay: w.delay ?? 0 }), walker: true, foreign: true })),
  ];
  const clash = (e, f) => {
    if (e.still && f.walker) return null;
    if (e.still && f.still) return null;
    return firstConflict(e.tr, f.tr, e.r, f.r, { combat, sameWave: !combat && !f.foreign && e.wave === f.wave });
  };
  const anyClash = e => fixed.some(f => clash(e, f)) || cur.some(f => f !== e && clash(e, f));
  /** The first conflict left: { victim, hit } or null. */
  const findConflict = () => {
    for (let i = 0; i < cur.length; i++) {
      const e = cur[i];
      for (const f of fixed) { const hit = clash(e, f); if (hit) return { victim: e, hit }; }
      for (let j = i + 1; j < cur.length; j++) {
        const f = cur[j];
        const hit = clash(e, f);
        if (!hit) continue;
        // The later one gives way, unless it stands still (then the one walking does); never the grabbed one while
        // the other walks too.
        let victim = f.still ? e : f;
        const other = victim === f ? e : f;
        if (keep && victim.id === keep && !other.still) victim = other;
        return { victim, hit };
      }
    }
    return null;
  };
  /** Cut e back to the furthest point before `hit` from which nothing meets it; else it stays. */
  const shrink = (e, hit) => {
    const v = (e.speed ?? MOTION.speed) / 1000;
    const total = pathLength(e.pts);
    const reach = Math.min(Math.max((hit.t - e.tr.start) * v, 0), total);
    const allowed = allowedFor(e);
    const cands = [];
    let run = 0;
    for (let k = 0; k + 1 < e.pts.length; k++) {
      const a = e.pts[k], b = e.pts[k + 1];
      const L = dist(a, b);
      const n = allowed ? Math.max(1, Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)))) : Math.max(1, Math.ceil(L / 0.25));
      for (let q = 1; q <= n; q++) {
        const tt = q / n;
        if (run + tt * L >= reach - 1e-3) break;
        if (q < n && allowed && !allowed({ x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt })) continue;
        cands.push({ k, t: tt });
      }
      run += L;
      if (run >= reach - 1e-3) break;
    }
    const base = e.cut;
    for (let c = cands.length - 1; c >= 0; c--) {
      e.cut = composeCut(base, cands[c]);
      build(e);
      // Never left at rest in a one-wide corridor or a doorway (S1R1-02): further back, or where it stands.
      if (!anyClash(e) && (!restOk || restOk(e.pts.at(-1), e.r))) { e.changed = true; return; }
    }
    e.cut = { k: 0, t: 0 };
    build(e);
    e.changed = true;
  };
  const cap = 4 * cur.length + 8;
  for (let round = 0; ; round++) {
    const c = findConflict();
    if (!c) break;
    yield "time";
    if (round >= cap) {
      // Past the cap: every member still in a conflict stays (members standing still never meet each other).
      for (const e of cur) if (!e.still && anyClash(e)) { e.cut = { k: 0, t: 0 }; build(e); e.changed = true; }
      if (round >= cap + cur.length + 1) break;
      continue;
    }
    shrink(c.victim, c.hit);
  }
  return new Map(cur.map(e => [e.id, { cut: e.cut, delay: e.still ? 0 : (e.delay ?? 0), points: e.pts, still: e.still, changed: e.changed }]));
}

/* -------------------------------------------- */
/*  The plan                                    */
/* -------------------------------------------- */

/**
 * Plan a group drop.
 *
 * Standing tokens (`others`) are hard obstacles everywhere (0.5.0): every route keeps round them (in a fight
 * too), rest slots keep clear of them, and the timing counts them; nothing ever "relaxes" into an overlap, and
 * a long way round is never swapped for the way through. A member with no route to its slot (a crowd in the way,
 * a Large that fits no door) walks the way that ignores the tokens (`o.toward`: for a Large as far as its body
 * fits) only as far as it is free of them, and stops there. Last, settle() cuts back any walk that would still
 * meet anything: stopping short beats overlapping.
 *
 * @param {object} spec
 * @param {object[]} spec.members   { id, r, w, h, start, formation, tl?, speed? }
 * @param {string} spec.anchorId    the grabbed token; its formation spot is its drop point
 * @param {boolean} [spec.combat]
 * @param {"plan"|"straight"} [spec.mode]
 * @param {{x,y,r}[]} [spec.others] tokens standing outside the group (circles, squares)
 * @param {{id,r,points,speed?,delay?}[]} [spec.moving]   tokens outside the group walking now, or reserved to walk
 *                                  (0.6.0: `delay` ms from now, negative when it set off earlier)
 * @param {{x,y,r}[]} [spec.reserved] where reserved walks of other moves end (0.6.0): no rest spot there
 * @param {object} o                the oracles (see the file header); toward(member, from, to) → { points, length,
 *                                  data? } or null: the way that ignores the tokens (for a big one as far as it fits)
 * @returns {Generator<string, object>}   the result: { result: "plan", members: { id → entry }, ... } or { result: "core", reason }
 */
export function* planGroup(spec, o) {
  const { anchorId, combat = false, mode = "plan", others = [], moving = [], reserved = [] } = spec;
  let { members } = spec;
  if (members.length > GROUP_LIMITS.maxMembers) return { result: "core", reason: "tooMany" };
  let anchor = members.find(m => m.id === anchorId);
  if (!anchor) return { result: "core", reason: "noAnchor" };
  if (mode === "straight") return straightPlan(spec, o);
  // In a fight every member, out of one a big one (S1R1-07), stops only on whole squares.
  const allowedFor = m => (combat || isBig(m) ? c => onCell(c, m.w ?? 1, m.h ?? 1) : null);
  // A member cut short never rests in a one-wide corridor or a doorway (S1R1-02; `o.cramped`, when the glue has it).
  const restOk = typeof o.cramped === "function" ? (c, r) => !o.cramped(c, r) : null;
  // Dropped on top of a token that is not in the group (live H1-08: on the Large in a full closet the
  // grabbed one walked as far as it could and parked in the one-wide connector): it takes the nearest
  // spot clear of every other token that it has a route to, on open floor rather than in a gap. In a fight
  // too, on whole squares (0.5.0: no rest on another token anywhere).
  let goals = [anchor.formation];
  {
    const clear = c => [...others, ...reserved].every(q => dist(c, q) >= anchor.r + q.r - EPS);
    if (!clear(anchor.formation)) {
      const roomy = c => !o.narrow?.([c, { x: c.x + 0.01, y: c.y }], anchor.r)?.length && !o.narrow?.([c, { x: c.x, y: c.y + 0.01 }], anchor.r)?.length;
      // Only spots it can walk to from the drop point (live H2-03: walls enclose no rock, so a spot in the rock
      // beside a full closet passed `walkable`; every try searched the whole scene, and the drop went to core
      // with the grabbed one in the one-wide connector). Open floor before any spot in a gap, nearest first:
      // as far as ANCHOR_RINGS out, so a full closet sends it to the room outside, not into the connector.
      const reached = c => { try { return o.walkDistance?.(c) !== null; } catch { return true; } };
      const tl = anchor.tl ?? { x: anchor.formation.x - (anchor.w ?? 1) / 2, y: anchor.formation.y - (anchor.h ?? 1) / 2 };
      const ring = combat ? cellCandidates(tl, anchor.w ?? 1, anchor.h ?? 1, ANCHOR_RINGS / 2) : hexCandidates(anchor.formation, anchor.r, ANCHOR_RINGS);
      const cands = ring
        .filter(c => clear(c) && o.walkable(anchor, c) && reached(c))
        .sort((a, b) => dist(a, anchor.formation) - dist(b, anchor.formation));
      const open = [], tight = [];
      for (const c of cands) {
        if (open.length >= ANCHOR_TRIES) break;
        (roomy(c) ? open : tight).push(c);
      }
      const pick = open.length ? open : tight;
      if (pick.length) goals = pick.slice(0, ANCHOR_TRIES);
    }
  }
  const rmax = Math.max(...members.map(m => m.r));
  const out = {};
  const timer = budget(o.now);
  const avoidOf = (m, to) => crowdFor(m, m.start, to, others);
  // Every route search of the plan runs in slices when the glue can (S2R1-02: one search with no way held the tab for
  // its whole cap, and every token on it froze); the same answer as o.route.
  const routeIn = function* (m, from, to, opts) {
    if (typeof o.routeSliced === "function") return yield* o.routeSliced(m, from, to, opts);
    return o.route(m, from, to, opts);
  };

  // The anchor's own route first: it decides "constricted".
  let anchorRoute = null;
  for (const goal of goals) {
    timer.member();
    const a = goal === anchor.formation ? anchor : { ...anchor, formation: { x: goal.x, y: goal.y } };
    const avoid = avoidOf(a, a.formation);
    anchorRoute = yield* routeIn(a, a.start, a.formation, { avoid });
    yield "route";
    // Its search ran out before it found the way (a cold or slow tab): finish it, on the whole plan's budget,
    // never "no route there" for a way that is there (live H4-01: the identical next drag planned and moved).
    if (!anchorRoute && o.unfinished?.() && o.routeLong) {
      anchorRoute = yield* o.routeLong(a, a.start, a.formation, { avoid });
      if (!anchorRoute && o.unfinished?.()) return { result: "core", reason: "budget" };
      if (timer.overTotal()) return { result: "core", reason: "budget" };
    } else if (timer.over()) return { result: "core", reason: "budget" };
    if (anchorRoute) {
      if (a !== anchor) { anchor = a; members = members.map(m => (m.id === anchorId ? anchor : m)); }
      break;
    }
  }
  let anchorShort = false;
  if (!anchorRoute) {
    // No way round the tokens standing in the way: the way that ignores them, as far as it is free (0.5.0). No way
    // at all (walls, a shut door): nothing to plan around, and nobody moves (decision 7).
    const t = o.toward?.(anchor, anchor.start, anchor.formation) ?? null;
    yield "route";
    if (!(t?.points?.length >= 2)) return { result: "core", reason: "anchorNoRoute" };
    const p = freePrefix(t.points, anchor.r, others, { allowed: allowedFor(anchor), restOk });
    anchorShort = !p.full || dist(t.points.at(-1), anchor.formation) > EPS;
    anchorRoute = { ...t, cut: p.cut, short: anchorShort };
  }
  const excluded = [];
  // The gap: where the anchor's route is narrower than two group diameters (its whole way, also when it stops short).
  const narrowPts = o.narrow?.(anchorRoute.points, rmax) ?? [];
  const gap = narrowPts[0] ?? null;
  const constricted = narrowPts.length > 0;

  // File order (constricted): front first — furthest along the anchor's route, then nearest the goal.
  const along = c => alongRoute(anchorRoute.points, c);
  const goal = anchor.formation;
  const front = (a, b) => along(b.start) - along(a.start) || dist(a.start, goal) - dist(b.start, goal) || (a.id < b.id ? -1 : 1);
  // Slot depth: how far past the gap (so the first through takes the spot furthest from it, laterally
  // too, and nobody rests in the way of those behind); along the route when the gap has no point.
  const depthOf = c => dist(c, gap);
  // Room around a point: wide both across and along (a short probe each way through the narrow test).
  const openAt = c => !o.narrow?.([c, { x: c.x + 0.01, y: c.y }], rmax)?.length
    && !o.narrow?.([c, { x: c.x, y: c.y + 0.01 }], rmax)?.length;
  const rank = [...members].sort(front).map(m => m.id);
  // The anchor dropped in the gap's mouth (0.5.0: with nothing allowed to brush past it, it would plug the gap for
  // everyone behind it): it goes last, and every other member rests past it.
  // Only at the mouth onto open floor: dropped inside a corridor, the file keeps its order (front first).
  const anchorLast = constricted && narrowPts.some(p => dist(p, anchor.formation) < anchor.r + rmax + MOTION.restGap - EPS)
    && openAt(anchor.formation);

  /** A member with no route to `to`: the way that ignores the standing tokens, as far as it is free; else it stays. */
  function* shortRoute(m, to) {
    const t = o.toward?.(m, m.start, to) ?? null;
    yield "route";
    if (!(t?.points?.length >= 2)) return { points: [{ x: m.start.x, y: m.start.y }], length: 0, data: null, cut: null, short: true };
    const p = freePrefix(t.points, m.r, others, { allowed: allowedFor(m), restOk });
    // Short of its spot: cut before a token, or a way that ends before it (a big one as far as its body fits).
    return { ...t, cut: p.cut, short: !p.full || dist(t.points.at(-1), to) > EPS };
  }
  const pathOf = r => (r.pts ??= prefixOf(r.points, r.cut ?? null));

  const routes = new Map([[anchorId, anchorRoute]]);
  let slots = null;
  for (let round = 0; round < 2; round++) {
    const obstacles = [...others, ...reserved, ...excluded.map(m => ({ ...(routes.has(m.id) ? pathOf(routes.get(m.id)).at(-1) : m.start), r: m.r }))];
    const live = members.filter(m => !excluded.includes(m));
    const a = assignSlots({ members: live, anchorId, walkable: o.walkable, walkDistance: o.walkDistance,
      others: obstacles, constricted, combat, rank, depthOf, route: anchorRoute.points, narrowPts, openAt, anchorLast });
    slots = a;
    for (const id of a.missing) {
      const m = members.find(x => x.id === id);
      excluded.push(m);
      routes.set(id, yield* shortRoute(m, m.formation));
    }
    let changed = false;
    for (const m of live) {
      if (m.id === anchorId || excluded.includes(m)) continue;
      const slot = a.slots[m.id];
      const prev = routes.get(m.id);
      if (prev && dist(prev.points.at(-1), slot) < EPS) continue;
      timer.member();
      const avoid = avoidOf(m, slot);
      let r = yield* routeIn(m, m.start, slot, { avoid });
      yield "route";
      // A member whose search only ran out is not left to core (live H4-02: core parked it in the corridor).
      if (!r && o.unfinished?.() && o.routeLong) {
        r = yield* o.routeLong(m, m.start, slot, { avoid });
        if (timer.overTotal()) return { result: "core", reason: "budget" };
      } else if (timer.over()) return { result: "core", reason: "budget" };
      if (r) routes.set(m.id, r);
      else { excluded.push(m); changed = true; routes.set(m.id, yield* shortRoute(m, slot)); }
    }
    if (!changed) break;
  }

  // Step C: timing. Tokens outside the group walking now (the rest of their walk from the drop) and standing ones
  // first and fixed: nobody sets off into one walking (live H4-03 / H4-04) or walks through one standing (0.5.0).
  const walkers = moving.filter(f => f.points?.length >= 2);
  const statics = others.map((c, i) => ({ id: `still:${c.id ?? i}`, r: c.r, tr: trajectory([{ x: c.x, y: c.y }]), wave: -1, foreign: true, still: true }));
  // Members that do not move at all (no free way): standing where they are, for everyone.
  const stays = members.filter(m => routes.has(m.id) && pathOf(routes.get(m.id)).length < 2);
  const base = [
    ...walkers.map(f => ({ id: `moving:${f.id}`, r: f.r, tr: trajectory(f.points, { speed: f.speed ?? MOTION.speed, delay: f.delay ?? 0 }), wave: 0, foreign: true })),
    ...statics,
    ...stays.map(m => ({ id: m.id, r: m.r, tr: trajectoryOf(pathOf(routes.get(m.id)), m.speed), wave: 0, still: true })),
  ];
  // Timing order: constricted, the file (front first); open ground, shortest remaining route first. Members with no
  // route to their slot go after the others (HX1-05: a Large that fits no door set off at once and walked through
  // Hero 1 still standing at its start).
  const moves = members.filter(m => routes.has(m.id) && !stays.includes(m));
  const lenOf = m => pathLength(pathOf(routes.get(m.id)));
  let order = [...moves.filter(m => !excluded.includes(m)).sort(constricted ? front : (a, b) => lenOf(a) - lenOf(b)
    || dist(a.start, goal) - dist(b.start, goal) || (a.id < b.id ? -1 : 1)),
  ...moves.filter(m => excluded.includes(m))];
  if (anchorLast) order = [...order.filter(m => m.id !== anchorId), ...order.filter(m => m.id === anchorId)];
  let replans = 0;
  /** A member standing at its start (one trajectory per member, so the pair memo keeps its answers). */
  const startTr = new Map();
  const startOf = q => {
    if (!startTr.has(q.id)) startTr.set(q.id, trajectory([{ x: q.start.x, y: q.start.y }]));
    return startTr.get(q.id);
  };
  const lateral = new Map();              // member id + avoid set → route (a re-pass reuses it)
  const reslots = new Map();               // member id + rests → { route } | null (a re-pass reuses it)
  const cellTl = (() => {
    const tl0 = anchor.tl ?? { x: anchor.formation.x - (anchor.w ?? 1) / 2, y: anchor.formation.y - (anchor.h ?? 1) / 2 };
    return combat ? tl0 : { x: Math.round(tl0.x), y: Math.round(tl0.y) };
  })();
  // Through a gap, a spot past it before one short of it (the group is going through).
  const gapEnd = constricted ? alongRoute(anchorRoute.points, narrowPts.at(-1)) : null;
  const beyond = c => (gapEnd === null || alongRoute(anchorRoute.points, c) > gapEnd + EPS ? 1 : 0);
  const hexAll = combat ? null : hexCandidates(anchor.formation, 2 * rmax + MOTION.restGap, GROUP_LIMITS.rings);
  const reachOk = c => {
    let wd = null;
    try { wd = o.walkDistance(c); } catch { wd = null; }
    return wd !== null && wd !== undefined && wd <= GROUP_LIMITS.walkRatio * dist(c, anchor.formation) + GROUP_LIMITS.walkSlack;
  };
  /**
   * A blocked member's other spot (0.5.0): the nearest free lattice spot (clear of everyone resting or standing and
   * of the spots the members after it take) that it has a route to round them all and a start delay for. Up to
   * RESLOT_TRIES routes; { route, tr, delay } or null; undefined when the budget ran out.
   */
  function* reslot(m, fixed, seq) {
    const rests = fixed.map(f => ({ ...f.tr.pts.at(-1), r: f.r }));
    const after = seq.slice(seq.indexOf(m) + 1);
    const ends = after.map(q => ({ ...pathOf(routes.get(q.id)).at(-1), r: q.r }));
    const starts = after.map(q => ({ x: q.start.x, y: q.start.y, r: q.r }));
    const key = `${m.id}|${rests.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).sort().join(";")}`;
    if (reslots.has(key)) {
      const hit = reslots.get(key);
      if (!hit) return null;
      const tr2 = trajectoryOf(hit.points, m.speed);
      const d2 = firstFreeDelay(tr2, m.r, fixed, combat) ?? freeDelayFrom(tr2, m.r, fixed, combat, 0);
      return d2 === null ? null : { route: hit, tr: tr2, delay: d2 };
    }
    const want = pathOf(routes.get(m.id)).at(-1);
    const mine = pathLength(pathOf(routes.get(m.id)));
    const lattice = combat || isBig(m) ? cellCandidates(cellTl, m.w ?? 1, m.h ?? 1, GROUP_LIMITS.rings) : hexAll;
    const cands = lattice
      .filter(c => [...rests, ...ends].every(q => dist(c, q) >= m.r + q.r + MOTION.restGap - EPS)
        && starts.every(q => dist(c, q) >= m.r + q.r - EPS) && o.walkable(m, c) && reachOk(c))
      .sort((a, b) => beyond(b) - beyond(a) || dist(a, want) - dist(b, want));
    // Round those at rest (the ones after it still waiting at their starts are the timing's to answer).
    const avoid = rests.map(q => ({ x: q.x, y: q.y, r: q.r + m.r })).filter(c => dist(c, m.start) >= c.r - EPS);
    let tries = 0;
    for (const c of cands) {
      if (tries >= RESLOT_TRIES) break;
      tries += 1;
      timer.member();
      const r = yield* routeIn(m, m.start, c, { avoid: avoid.filter(q => dist(q, c) >= q.r - EPS) });
      replans += 1;
      yield "route";
      if (timer.over()) return undefined;
      // Never the long way round to another spot either (S1R1-01: a 30 s walk round the whole dungeon for a spot
      // the others reached in 6 s through the door): it stops short instead (settle).
      if (!r || detourTooLong(mine, r.length)) continue;
      const tr2 = trajectoryOf(r.points, m.speed);
      const d2 = firstFreeDelay(tr2, m.r, fixed, combat) ?? freeDelayFrom(tr2, m.r, fixed, combat, 0);
      if (d2 !== null) { reslots.set(key, r); return { route: r, tr: tr2, delay: d2 }; }
    }
    reslots.set(key, null);
    return null;
  }

  /** One timing pass over `seq`: { entries, blocked: [{ id, blocker }] }. */
  function* pass(seq, { other = false } = {}) {
    const fixed = [...base];
    const entries = {};
    const blocked = [];
    for (const m of seq) {
      // The timing is the plan's own work: it counts toward the whole plan's budget, not one member's routes,
      // and it yields, so a slow tab draws its frames between members.
      timer.member();
      yield "time";
      let route = routes.get(m.id);
      let tr = trajectoryOf(pathOf(route), m.speed);
      let level = 0;
      let delay = firstFreeDelay(tr, m.r, fixed, combat);
      // The members timed after it stand at their starts at least until it sets off.
      const later = seq.slice(seq.indexOf(m) + 1);
      // Does it walk through the start of a member timed after it (S1R1-01: Hero 3 cut past Hero 4 still waiting at
      // its start; Hero 4 then could not go after it, nor before it without plugging Hero 3's way, and Hero 3 took
      // another spot round the whole dungeon)? Then it tries the way round them first, as below.
      const crossesLater = (t, d) => later.some(q => conflicts(delayed(t, d), m.r, { r: q.r, tr: startOf(q) }, combat, false));
      if (delay === null || (later.length && crossesLater(tr, delay))) {
        // Lateral re-plan: earlier members' rest circles and the standing tokens as static obstacles (not those
        // already on our start or end).
        const end = pathOf(route).at(-1);
        // ... and the starts of the members timed after it.
        const starts = later.map(q => ({ x: q.start.x, y: q.start.y, r: q.r + m.r }));
        const avoid = [...fixed.map(f => ({ ...f.tr.pts.at(-1), r: f.r + m.r })), ...starts]
          .filter(c => dist(c, m.start) >= c.r - EPS && dist(c, end) >= c.r - EPS);
        const key = `${m.id}|${avoid.map(c => `${c.x.toFixed(3)},${c.y.toFixed(3)}`).sort().join(";")}`;
        let again = lateral.get(key);
        if (again === undefined && avoid.length) {
          timer.member();
          again = (yield* routeIn(m, m.start, end, { avoid })) ?? null;
          lateral.set(key, again);
          replans += 1;
          yield "route";
          if (timer.over()) return null;
        }
        // Never the long way round (live H3-03: a member re-planned round the others' rest spots walked 83 squares
        // round the dungeon for a 9-square walk through the door): the H2-02 rule; else it waits its turn (safe).
        if (again && !detourTooLong(pathLength(pathOf(route)), again.length)) {
          const tr2 = trajectoryOf(again.points, m.speed);
          const d2 = firstFreeDelay(tr2, m.r, fixed, combat);
          // Taken when it had no delay at all, or when it no longer walks through a later member's start.
          if (d2 !== null && (delay === null || !crossesLater(tr2, d2))) { route = { ...again, short: route.short }; tr = tr2; delay = d2; level = 1; }
        }
      }
      if (delay === null) {
        // Go last: wait until everything walking that it meets is at rest.
        const blockers = conflictsAt(tr, m.r, 0, fixed, combat);
        const last = Math.max(0, ...blockers.map(f => f.tr.end));
        const d = Math.ceil(last / MOTION.delayStep - EPS) * MOTION.delayStep;
        // A long queue (the 0.75-square buffer files a door at about one member per 300 ms): from there, up to
        // twice the delay cap later.
        const dd = freeDelayFrom(tr, m.r, fixed, combat, d);
        if (dd !== null) { delay = dd; level = 2; }
        else {
          // Another free spot it can reach and time clear of everyone (0.5.0: in a packed room the spot it was given
          // can be walled in by those resting round it).
          // Never the grabbed one: it lands where it was dropped, or stops short of it.
          const found = other && m.id !== anchorId ? yield* reslot(m, fixed, seq) : null;
          if (found === undefined) return null;
          if (found) { route = found.route; tr = found.tr; delay = found.delay; level = 1; }
          else {
            // Still in the way of someone at rest (or standing outside the group): the next pass tries it before
            // that member; settle() cuts what is left. Never an accepted overlap (0.5.0: no "relax").
            const late = conflictsAt(tr, m.r, d, fixed, combat).find(f => f.id !== m.id && !f.foreign && !f.still);
            blocked.push({ id: m.id, blocker: late?.id ?? null });
            delay = d;
            level = 2;
          }
        }
      }
      const wave = Math.ceil(delay / MOTION.waveMs - EPS);
      fixed.push({ id: m.id, r: m.r, tr: delayed(tr, delay), wave });
      entries[m.id] = { m, route, delay, level };
    }
    return { entries, blocked, seq };
  }

  // A member blocked by an earlier member resting in its way goes before that member, and the pass runs again
  // (a few times at most); the pass with the fewest blocked members is kept. Then, if any is still blocked, one
  // more pass in that order lets each blocked member take another free spot (reslot).
  let best = null;
  for (let attempt = 0; attempt < 2 * Math.max(order.length, 1); attempt++) {
    const p = yield* pass(order);
    if (!p) return { result: "core", reason: "budget" };
    if (!best || p.blocked.length < best.blocked.length) best = p;
    const fix = p.blocked.find(x => x.blocker);
    if (!fix) break;
    const mover = order.find(m => m.id === fix.id);
    const next = order.filter(m => m !== mover);
    next.splice(next.findIndex(m => m.id === fix.blocker), 0, mover);
    order = next;
  }
  if (best.blocked.length) {
    const p = yield* pass(best.seq, { other: true });
    if (!p) return { result: "core", reason: "budget" };
    if (p.blocked.length < best.blocked.length) best = p;
  }

  // Settle: whatever still meets anything is cut back (stopping short beats overlapping).
  const list = [...best.seq.map(m => {
    const e = best.entries[m.id];
    return { id: m.id, r: m.r, w: m.w, h: m.h, speed: m.speed, points: e.route.points, cut: e.route.cut ?? null, delay: e.delay };
  }), ...stays.map(m => ({ id: m.id, r: m.r, w: m.w, h: m.h, speed: m.speed, points: pathOf(routes.get(m.id)), cut: null, delay: 0 }))];
  const settled = yield* settle(list, { statics: others, walkers, combat, allowedFor, keep: anchorId, restOk });
  const cutIds = [], stayed = [];
  for (const m of [...best.seq, ...stays]) {
    const s = settled.get(m.id);
    const e = best.entries[m.id];
    const route = e?.route ?? routes.get(m.id);
    const short = !!route.short || s.changed;
    if (s.changed) (s.still ? stayed : cutIds).push(m.id);
    else if (s.still) stayed.push(m.id);
    const level = s.still ? "stay" : s.changed ? "cut" : route.short ? "short" : e.level;
    out[m.id] = { id: m.id, core: false, slot: s.points.at(-1), points: s.points, data: route.data ?? null, cut: s.cut ?? null,
      delay: s.still ? 0 : s.delay, level, length: pathLength(s.points), short };
  }
  return {
    result: "plan", members: out, anchorId, constricted, formation: slots?.formation ?? true,
    reslotted: slots?.reslotted ?? [], excluded: excluded.map(m => m.id), replans, cut: cutIds, stayed,
    blocked: best.blocked.length, anchorShort: anchorShort || !!out[anchorId]?.short,
    ms: timer.elapsed(),
  };
}

/**
 * Ghost / unconstrained out of combat: straight lines, the formation kept, one batch. Only a member
 * whose rest circle overlaps an earlier one's (anchor first, then larger, then id) is nudged to the
 * nearest free lattice spot, still in a straight line.
 */
function straightPlan({ members, anchorId, others = [] }, o) {
  const anchor = members.find(m => m.id === anchorId);
  const rmax = Math.max(...members.map(m => m.r));
  const order = [anchor, ...members.filter(m => m !== anchor).sort((a, b) => b.r - a.r || (a.id < b.id ? -1 : 1))];
  const placed = [];
  const out = {};
  const nudged = [];
  const hex = hexCandidates(anchor.formation, 2 * rmax + MOTION.restGap);
  for (const m of order) {
    const free = c => placed.every(p => dist(c, p.c) >= m.r + p.r - EPS) && others.every(p => dist(c, p) >= m.r + p.r - EPS);
    let slot = m.formation;
    if (m !== anchor && !free(slot)) {
      const pick = hex.filter(c => free(c) && placed.every(p => dist(c, p.c) >= m.r + p.r + MOTION.restGap - EPS)
        && o.walkable(m, c)).sort((a, b) => dist(a, m.formation) - dist(b, m.formation))[0];
      if (pick) { slot = pick; nudged.push(m.id); }
    }
    placed.push({ c: slot, r: m.r });
    out[m.id] = { id: m.id, core: false, slot, points: [m.start, slot], delay: 0, level: 0, straight: true };
  }
  return { result: "plan", members: out, anchorId, constricted: false, formation: !nudged.length, reslotted: nudged,
    excluded: [], replans: 0, cut: [], stayed: [], blocked: 0, anchorShort: false, ms: 0, straight: true };
}

/** Per-member and total budget on the oracle clock. */
function budget(now = () => 0) {
  const t0 = now();
  let m0 = t0;
  return {
    member() { m0 = now(); },
    over() {
      const t = now();
      return t - m0 > GROUP_LIMITS.memberMs || t - t0 > GROUP_LIMITS.totalMs;
    },
    overTotal: () => now() - t0 > GROUP_LIMITS.totalMs,
    elapsed: () => Math.round((now() - t0) * 10) / 10,
  };
}

/**
 * Drive a planGroup generator for up to `budgetMs` of `now()`. Returns { done: true, value } or
 * { done: false } (call again to continue). A throw propagates (the glue falls back to core).
 */
export function runPlan(gen, budgetMs, now = () => 0) {
  const t0 = now();
  for (;;) {
    const step = gen.next();
    if (step.done) return { done: true, value: step.value };
    if (now() - t0 >= budgetMs) return { done: false };
  }
}

/* -------------------------------------------- */
/*  Rest spots for a drop left to core          */
/* -------------------------------------------- */

/**
 * Where each member of a group drop that went to core (budget, no anchor route, a throw, ...) stops,
 * so that no two rest on top of each other (live R1 D-1: core's paths, cut at walls, left members
 * stacked at distance 0). Each member keeps its own path and stops at its furthest point whose
 * circle is clear of every member placed before it (touching is fine); one that finds none stays
 * where it is, and is then held there while the others are placed again (R2-1). Members that do not
 * move are placed first, then the held ones, then the list order (the grabbed token first: only a
 * member that cannot move at all pulls it back).
 *
 * @param {{ id, r, path: {x,y}[] }[]} list   centres in squares, start first; a path of one point does not move
 * @param {object} [o]
 * @param {number} [o.step]                    sample spacing along a segment (squares)
 * @param {(c, member) => boolean} [o.allowed] a stop point other than a path vertex must pass this
 *                                             (in combat: a cell centre)
 * @param {{x,y,r}[]} [o.hard]                 circles of tokens standing outside the drop: a path stops before
 *                                             the first it would enter (0.5.0; one it starts on does not count)
 * @returns {Object<string, { x, y, k, t, end: boolean }>}  the point lies on segment k (path[k] → path[k+1])
 *                                             at fraction t; end: the path's own end
 */
export function restOnPaths(list, { step = 0.25, allowed = null, hard = [] } = {}) {
  // A member with no clear point stays at its start, which a member placed before it may already
  // hold (live R2-1: a row walking into a wall, the middle one boxed in, ended on its neighbour).
  // Such a member is held at its start from then on, placed before the movers, and the drop is
  // placed again; each round holds at least one more, so it ends within list.length rounds.
  const held = new Set();
  let out = null;
  for (let round = 0; round <= list.length; round++) {
    const r = restOnce(list, held, step, allowed, hard);
    out = r.out;
    if (!r.stuck.length) break;
    for (const id of r.stuck) held.add(id);
  }
  return out;
}

function restOnce(list, held, step, allowed, hard) {
  const out = {};
  const placed = [];
  const stuck = [];
  const clear = (m, c) => placed.every(p => dist(c, p.c) >= m.r + p.r - EPS);
  const still = m => (m.path?.length ?? 0) < 2;
  const ordered = [...list.filter(still), ...list.filter(m => !still(m) && held.has(m.id)), ...list.filter(m => !still(m) && !held.has(m.id))];
  for (const m of ordered) {
    const path = m.path ?? [];
    if (still(m)) {
      const c = path[0] ?? { x: 0, y: 0 };
      out[m.id] = { x: c.x, y: c.y, k: 0, t: 0, end: true };
      placed.push({ c, r: m.r });
      continue;
    }
    // Held at its start, unless that start is already taken (two that began on one spot): it then looks along its path.
    if (held.has(m.id) && clear(m, path[0])) {
      out[m.id] = { x: path[0].x, y: path[0].y, k: 0, t: 0, end: false };
      placed.push({ c: { x: path[0].x, y: path[0].y }, r: m.r });
      continue;
    }
    let pick = null;
    // Never past the first token standing in its way (0.5.0: core's path is cut there, not walked through it).
    const lim = hard?.length ? firstIntrusion(path, m.r, hard) : null;
    for (let k = lim ? lim.k : path.length - 2; k >= 0 && !pick; k--) {
      const a = path[k], b = path[k + 1];
      const L = dist(a, b);
      const n = Math.max(Math.ceil(L / step), 1);
      for (let q = n; q >= 0; q--) {
        const t = q / n;
        if (q === 0 && k > 0) continue;               // the vertex is the previous segment's t = 1
        if (lim && k === lim.k && t > lim.t - (L > EPS ? 0.01 / L : 0)) continue;
        const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const vertex = q === n || q === 0;
        if (!vertex && allowed && !allowed(c, m)) continue;
        if (!clear(m, c)) continue;
        pick = { ...c, k, t };
        break;
      }
    }
    if (!pick && !held.has(m.id)) stuck.push(m.id);
    pick ??= { ...path[0], k: 0, t: 0 };
    const end = pick.k === path.length - 2 && pick.t >= 1 - EPS;
    out[m.id] = { x: pick.x, y: pick.y, k: pick.k, t: pick.t, end };
    placed.push({ c: { x: pick.x, y: pick.y }, r: m.r });
  }
  return { out, stuck };
}

/* -------------------------------------------- */
/*  A flood for walk distances                  */
/* -------------------------------------------- */

/**
 * Walking distance (squares, 8-connected, √2 diagonals) from `origin` to every cell within `radius`,
 * as a Map "i,j" → distance. `step(a, b)` says whether one step is open.
 */
export function flood(origin, step, radius = 12) {
  const out = new Map([[`${origin.i},${origin.j}`, 0]]);
  const open = [{ n: origin, d: 0 }];
  const D = [[0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (open.length) {
    let k = 0;
    for (let q = 1; q < open.length; q++) if (open[q].d < open[k].d) k = q;
    const { n, d } = open.splice(k, 1)[0];
    if (d > (out.get(`${n.i},${n.j}`) ?? Infinity) + EPS) continue;
    for (const [di, dj, c] of D) {
      const m = { i: n.i + di, j: n.j + dj };
      if (Math.max(Math.abs(m.i - origin.i), Math.abs(m.j - origin.j)) > radius) continue;
      const nd = d + c;
      const key = `${m.i},${m.j}`;
      if (nd >= (out.get(key) ?? Infinity) - EPS) continue;
      if (!step(n, m)) continue;
      out.set(key, nd);
      open.push({ n: m, d: nd });
    }
  }
  return out;
}
