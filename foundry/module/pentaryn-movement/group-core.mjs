/**
 * Pure group planning for pentaryn-movement 0.4.0 (plan context/plans/pathfinding-2026-11.md §12
 * "Group planning algorithm", deviations in §13). No Foundry globals.
 *
 * Units as motion-core.mjs: centres in grid squares, ms, squares per second. The Foundry side
 * (group-adapter.mjs, group.mjs) supplies the oracles:
 *
 *   walkable(member, c)        can that member stand with its centre at c (walls, scene edge)?
 *   walkDistance(c)            walking distance from the anchor's destination to c, or null (flood)
 *   route(member, from, to, { avoid })   { points: [{x,y}], length, data? } or null
 *   narrow(points, rmax)       the points where the anchor's route passes a gap narrower than 2 group
 *                              diameters, in route order ([] when it never does)
 *   now()                      clock (ms), for the budget
 *
 * planGroup() is a generator: it yields after every route call (the expensive step), so the glue
 * can run it in time slices and give up past the budget (runPlan()).
 */

import { MOTION, dist, firstConflict, trajectory, delayed, GROUP_MAX } from "./motion-core.mjs";

export const GROUP_LIMITS = Object.freeze({
  maxMembers: GROUP_MAX,
  memberMs: 150,       // one member's routes, all tries
  totalMs: 300,        // the whole plan: past this the drop is core's (a silent wait longer than this reads as lag)
  syncMs: 30,          // what the drop spends synchronously before going async
  rings: 5,            // candidate rings around the anchor
  walkRatio: 2,        // a slot's walk distance ≤ this × its straight distance (no slots through a wall)
  walkSlack: 0.75,     // squares added to that bound (the flood is on whole cells)
});

const EPS = 1e-6;

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
 * @returns {{ slots: Object<string,{x,y}>, formation: boolean, reslotted: string[], missing: string[] }}
 */
export function assignSlots({ members, anchorId, walkable, walkDistance, others = [], constricted = false,
  combat = false, gap = MOTION.restGap, rings = GROUP_LIMITS.rings, rank = null, depthOf = null,
  route = null, narrowPts = [], openAt = null }) {
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
  const latticeFor = m => (combat
    ? cellCandidates(anchor.tl ?? { x: anchor.formation.x - anchor.w / 2, y: anchor.formation.y - anchor.h / 2 }, m.w, m.h, rings)
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
    const big = members.reduce((a, b) => (b.r > a.r ? b : a));
    const byId = new Map(members.map(m => [m.id, m]));
    const file = rank.map(id => byId.get(id)).filter(Boolean);
    const ia = Math.max(file.indexOf(anchor), 0);
    const ahead = file.slice(0, ia), behind = file.slice(ia + 1);
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

/** The fixed trajectories `tr` (delay 0 shape) conflicts with at `delay`, or [] when clear. */
function conflictsAt(tr, r, delay, fixed, combat) {
  const mine = delayed(tr, delay);
  const wave = Math.ceil(delay / MOTION.waveMs - 1e-9);
  return fixed.filter(f => firstConflict(mine, f.tr, r, f.r, {
    combat, sameWave: f.wave === wave,
  }) !== null);
}

/** The smallest delay with no conflict, or null. */
function firstFreeDelay(tr, r, fixed, combat) {
  for (const d of delaySteps()) if (!conflictsAt(tr, r, d, fixed, combat).length) return d;
  return null;
}

/* -------------------------------------------- */
/*  The plan                                    */
/* -------------------------------------------- */

/**
 * Plan a group drop.
 *
 * @param {object} spec
 * @param {object[]} spec.members   { id, r, w, h, start, formation, tl?, speed?, corePath?: {x,y}[] }
 *                                  corePath: where core's own path would take it (a member with no route keeps that)
 * @param {string} spec.anchorId    the grabbed token; its formation spot is its drop point
 * @param {boolean} [spec.combat]
 * @param {"plan"|"straight"} [spec.mode]
 * @param {{x,y,r}[]} [spec.others]
 * @param {object} o                the oracles (see the file header)
 * @returns {Generator<string, object>}   the result: { result: "plan", members: { id → entry }, ... } or { result: "core", reason }
 */
export function* planGroup(spec, o) {
  const { members, anchorId, combat = false, mode = "plan", others = [] } = spec;
  if (members.length > GROUP_LIMITS.maxMembers) return { result: "core", reason: "tooMany" };
  const anchor = members.find(m => m.id === anchorId);
  if (!anchor) return { result: "core", reason: "noAnchor" };
  const rmax = Math.max(...members.map(m => m.r));
  const out = {};
  const timer = budget(o.now);

  if (mode === "straight") return straightPlan(spec, o);

  // The anchor's own route first: it decides "constricted".
  timer.member();
  const anchorRoute = o.route(anchor, anchor.start, anchor.formation, {});
  yield "route";
  if (timer.over()) return { result: "core", reason: "budget" };
  // No route for the anchor: nothing to plan around (its end is wherever core stops it).
  if (!anchorRoute) return { result: "core", reason: "anchorNoRoute" };
  const excluded = [];
  // The gap: where the anchor's route is narrower than two group diameters.
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

  const routes = new Map([[anchorId, anchorRoute]]);
  let slots = null;
  for (let round = 0; round < 2; round++) {
    const obstacles = [...others, ...excluded.map(m => ({ ...(m.corePath?.at(-1) ?? m.start), r: m.r }))];
    const live = members.filter(m => !excluded.includes(m));
    const a = assignSlots({ members: live, anchorId, walkable: o.walkable, walkDistance: o.walkDistance,
      others: obstacles, constricted, combat, rank, depthOf, route: anchorRoute.points, narrowPts, openAt });
    slots = a;
    for (const id of a.missing) excluded.push(members.find(m => m.id === id));
    let changed = false;
    for (const m of live) {
      if (m.id === anchorId || excluded.includes(m)) continue;
      const slot = a.slots[m.id];
      const prev = routes.get(m.id);
      if (prev && dist(prev.points.at(-1), slot) < EPS) continue;
      timer.member();
      const r = o.route(m, m.start, slot, {});
      yield "route";
      if (timer.over()) return { result: "core", reason: "budget" };
      if (r) routes.set(m.id, r);
      else { routes.delete(m.id); excluded.push(m); changed = true; }
    }
    if (!changed) break;
  }

  // Step C: timing. Excluded members move as core moves them, first and fixed.
  const base = [];
  for (const m of excluded) {
    const path = m.corePath?.length ? m.corePath : [m.start];
    base.push({ id: m.id, r: m.r, tr: trajectory(path, { speed: m.speed }), wave: 0 });
    out[m.id] = { id: m.id, core: true, slot: path.at(-1), points: path, delay: 0, level: "core" };
  }
  // Timing order: constricted, the file (front first); open ground, shortest remaining route first.
  let order = members.filter(m => routes.has(m.id) && !excluded.includes(m)).sort(constricted ? front : (a, b) =>
    routes.get(a.id).length - routes.get(b.id).length
    || dist(a.start, goal) - dist(b.start, goal) || (a.id < b.id ? -1 : 1));
  let replans = 0;
  const lateral = new Map();               // member id + avoid set → route (a re-pass reuses it)

  /** One timing pass over `order`: { entries, relaxed: [{ id, blocker }] }. */
  function* pass(seq) {
    const fixed = [...base];
    const entries = {};
    const relaxed = [];
    for (const m of seq) {
      let route = routes.get(m.id);
      let tr = trajectory(route.points, { speed: m.speed });
      let level = 0;
      let delay = firstFreeDelay(tr, m.r, fixed, combat);
      if (delay === null && !combat) {
        // Lateral re-plan: earlier members' rest circles as static obstacles (not those already on our start or slot).
        const avoid = fixed.map(f => ({ ...f.tr.pts.at(-1), r: f.r + m.r }))
          .filter(c => dist(c, m.start) >= c.r - EPS && dist(c, route.points.at(-1)) >= c.r - EPS);
        const key = `${m.id}|${avoid.map(c => `${c.x.toFixed(3)},${c.y.toFixed(3)}`).sort().join(";")}`;
        let again = lateral.get(key);
        if (again === undefined && avoid.length) {
          timer.member();
          again = o.route(m, m.start, route.points.at(-1), { avoid }) ?? null;
          lateral.set(key, again);
          replans += 1;
          yield "route";
          if (timer.over()) return null;
        }
        if (again) {
          const tr2 = trajectory(again.points, { speed: m.speed });
          const d2 = firstFreeDelay(tr2, m.r, fixed, combat);
          if (d2 !== null) { route = again; tr = tr2; delay = d2; level = 1; }
        }
      }
      if (delay === null) {
        // Go last: wait until everything it meets is at rest.
        const blockers = conflictsAt(tr, m.r, 0, fixed, combat);
        const last = Math.max(...blockers.map(f => f.tr.end));
        const d = Math.ceil(last / MOTION.delayStep - EPS) * MOTION.delayStep;
        if (!conflictsAt(tr, m.r, d, fixed, combat).length) { delay = d; level = 2; }
        else {
          // Relax. Who is in the way even after they have all stopped (a resting circle)?
          const late = conflictsAt(tr, m.r, d, fixed, combat).find(f => f.id !== m.id && !excluded.some(x => x.id === f.id));
          relaxed.push({ id: m.id, blocker: late?.id ?? null });
          delay = 0; level = 3;
        }
      }
      const wave = Math.ceil(delay / MOTION.waveMs - EPS);
      fixed.push({ id: m.id, r: m.r, tr: delayed(tr, delay), wave });
      entries[m.id] = { id: m.id, core: false, slot: route.points.at(-1), points: route.points, data: route.data ?? null,
        delay, level, length: route.length };
    }
    return { entries, relaxed };
  }

  // A member that had to relax because an earlier member rests in its way goes before that member,
  // and the pass runs again (a few times at most); the pass with the fewest relaxations is kept.
  let best = null;
  for (let attempt = 0; attempt < 2 * order.length; attempt++) {
    const p = yield* pass(order);
    if (!p) return { result: "core", reason: "budget" };
    if (!best || p.relaxed.length < best.relaxed.length) best = p;
    const fix = p.relaxed.find(x => x.blocker);
    if (!fix) break;
    const mover = order.find(m => m.id === fix.id);
    const next = order.filter(m => m !== mover);
    next.splice(next.findIndex(m => m.id === fix.blocker), 0, mover);
    order = next;
  }
  Object.assign(out, best.entries);
  const relaxed = best.relaxed.length;
  return {
    result: "plan", members: out, constricted, formation: slots?.formation ?? true,
    reslotted: slots?.reslotted ?? [], excluded: excluded.map(m => m.id), replans, relaxed,
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
  return { result: "plan", members: out, constricted: false, formation: !nudged.length, reslotted: nudged,
    excluded: [], replans: 0, relaxed: 0, ms: 0, straight: true };
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
