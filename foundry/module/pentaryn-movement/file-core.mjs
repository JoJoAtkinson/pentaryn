/**
 * Pure B0, the floor of a group drag out of combat (0.9.0, plan context/plans/pathfinding-2026-11.md §17; Fable's
 * review 2 §2 "Tier B, the file", step 2 "B0"). No Foundry globals.
 *
 * One pass at the drop, per member in order (the grabbed one first, then least walk left first):
 *   - its slot: the free spot nearest its formation spot (its start plus the drag's delta) that it can reach. Free:
 *     it can stand there, clear of every token standing outside the drop, of every slot already given out and of
 *     every route already given out (a mate that gets there first never rests in an earlier one's way);
 *   - its route: an A* route round the tokens standing outside the drop and round the slots already given out
 *     (space, not time). A route that leaves a circle it starts inside may do so; it never enters one.
 *   - no reachable slot: it stays where it stands, and is named. A member that stays, or whose slot is its own start
 *     (only when that is within a square of its formation spot), stands still: the pass runs again with it among the
 *     standing tokens until nothing changes (each pass fixes at least one more member in place, so it ends). The
 *     members that stayed are tried again planned first, and the order that sends the most wins.
 * B0 alone moves every member in one batched update with no stagger; B1 (staggerFile, below) times the same routes.
 * Two members both moving may brush (soft, Joe 2026-11-24); a standing token, a slot and a rest overlap never (hard).
 *
 * Units: centres in grid squares (as motion-core). Touching is fine; coming inside is not.
 */

import { MOTION, delayed, dist, firstConflict, trajectory } from "./motion-core.mjs";
import { cellCandidates, firstIntrusion, hexCandidates, pathLength } from "./group-core.mjs";
import { sequence } from "./sequence-core.mjs";

const EPS = 1e-6;

export const FILE = Object.freeze({
  rings: 5,            // candidate rings round a formation spot
  tries: 4,            // routes searched per member (candidates that pass the cheap tests, nearest first)
  memberMs: 300,       // planning time per member, every try (the plan's own clock)
  totalMs: 1500,       // planning time for the whole drop: a member not reached by then stays and is named
  walkRatio: 1.5,      // a slot's walk from the formation spot ≤ this × its straight distance + walkSlack (no slot behind a wall)
  walkSlack: 1,
  reorders: 3,         // orders tried again with the members that stayed planned first
  slack: 0.02,         // squares a route may graze a circle it keeps out of (the search's own one-pixel clearance)
  reach: 9,            // squares (rings) the walk oracle floods out from a spot; past it, walk() knows nothing
});

/** Is `c` (radius r) clear of every circle in `list` ({ x, y, r })? Touching is clear. */
export const clearOf = (c, r, list) => list.every(o => dist(c, o) >= r + o.r - EPS);

/** Distance from point p to segment a-b. */
function segPoint(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 > EPS ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

/** Smallest distance from a point to a polyline. */
export function wayToPoint(points, c) {
  if (!points?.length) return Infinity;
  if (points.length === 1) return dist(points[0], c);
  let best = Infinity;
  for (let k = 1; k < points.length; k++) best = Math.min(best, segPoint(c, points[k - 1], points[k]));
  return best;
}

/**
 * The order members are planned in: the grabbed one first (it owns the drop point), then least walk left first (its
 * straight distance from start to formation spot), then id.
 */
export function orderOf(members, anchorId = null) {
  return [...members].sort((a, b) => (a.id === anchorId ? -1 : b.id === anchorId ? 1 : 0)
    || dist(a.start, a.formation) - dist(b.start, b.formation) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The spots tried for member m, nearest its formation spot first: the spot itself, then whole squares (a big one, or a
 * snapped drop), else a touching hex. With `walk` (m, c → squares walked from the formation spot, or null), nearest by
 * walking, and a spot only when that walk is about straight (no spot round the far side of a wall: at most
 * FILE.walkRatio × the straight way + FILE.walkSlack).
 *
 * With `anchor` (the grabbed one; 0.9.0 simulator, step 5): a formation spot the drop point does not reach so (it lies
 * behind the room's wall, past the scene's edge, in rock) has nothing on the far side of that wall to keep away from,
 * and walking from it reaches nothing. Then the spots round it and round the drop point that the drop point reaches
 * about straight, nearest the formation spot first: the member comes along into the room instead of staying.
 */
export function candidatesFor(m, rings = FILE.rings, walk = null, anchor = null) {
  const f = m.formation;
  const ring = spotsRound(m, f, rings);
  const all = [{ x: f.x, y: f.y }, ...ring];
  if (!walk) return all.sort((a, b) => dist(a, f) - dist(b, f));
  const about = (wd, c, from) => wd !== null && wd !== undefined && wd <= FILE.walkRatio * dist(c, from) + FILE.walkSlack + EPS;
  const fromAnchor = c => { try { return walk(anchor, c); } catch { return null; } };
  // Only within the flood's reach of the drop point (farther, walk() from it knows nothing either way).
  const near = anchor && Math.max(Math.abs(f.x - anchor.formation.x), Math.abs(f.y - anchor.formation.y)) <= FILE.reach - 1;
  if (near && anchor.id !== m.id && !about(fromAnchor(f), f, anchor.formation)) {
    const seen = new Set();
    const keyed = [];
    // Round the drop point on m's own lattice (a 1×1 beside a 2×2 grabbed one still rests on whole squares).
    const w = m.w ?? 1, h = m.h ?? w;
    const onGrid = Math.abs(f.x - w / 2 - Math.round(f.x - w / 2)) < EPS && Math.abs(f.y - h / 2 - Math.round(f.y - h / 2)) < EPS;
    const a = onGrid ? { x: Math.round(anchor.formation.x - w / 2) + w / 2, y: Math.round(anchor.formation.y - h / 2) + h / 2 } : anchor.formation;
    for (const c of [...all, ...spotsRound(m, a, rings)]) {
      const k = `${c.x.toFixed(4)},${c.y.toFixed(4)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const wd = fromAnchor(c);
      if (!about(wd, c, anchor.formation)) continue;
      keyed.push({ c, wd, d: dist(c, f) });
    }
    if (keyed.length) return keyed.sort((a, b) => a.d - b.d || a.wd - b.wd).map(k => k.c);
  }
  const keyed = [];
  for (const c of all) {
    let wd = null;
    try { wd = walk(m, c); } catch { wd = null; }
    if (!about(wd, c, f)) continue;
    keyed.push({ c, wd, d: dist(c, f) });
  }
  return keyed.sort((a, b) => a.wd - b.wd || a.d - b.d).map(k => k.c);
}

/** The spots round centre `f` for member m (whole squares for a big one or a snapped spot, else a touching hex). */
function spotsRound(m, f, rings) {
  const w = m.w ?? 1, h = m.h ?? w;
  const tl = { x: f.x - w / 2, y: f.y - h / 2 };
  const onGrid = Math.abs(tl.x - Math.round(tl.x)) < EPS && Math.abs(tl.y - Math.round(tl.y)) < EPS;
  return onGrid || w > 1 || h > 1
    ? cellCandidates({ x: Math.round(tl.x), y: Math.round(tl.y) }, w, h, rings)
    : hexCandidates(f, 2 * m.r, 2 * rings);
}

/**
 * Does route `points` (radius r) ever come inside one of `circles` after leaving the ones it starts inside? (A circle
 * it starts inside is one it is leaving: a mate's slot on its start, a crowd it was pressed into.)
 */
export function routeEnters(points, r, circles, slack = FILE.slack) {
  if (!(points?.length >= 2) || !circles?.length) return null;
  // firstIntrusion already leaves out the circles it starts on; `slack`: the route search keeps a pixel's clearance.
  const hit = firstIntrusion(points, r, circles.map(c => ({ ...c, r: Math.max(c.r - slack, 0) })));
  if (!hit) return null;
  const a = points[hit.k], b = points[hit.k + 1];
  return { k: hit.k, t: hit.t, at: { x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t } };
}

/**
 * One pass of B0 for `order`, the members in `fixed` standing where they are (`why`: id → the reason it stays, for
 * the ones that stay; one fixed without a reason stands at its own spot).
 * @returns {{ entries: Object<string, { slot, points, stay?: string, atStart?: boolean }>, fixed: Map<string, string|null> }}
 *          `fixed`: the members that stand still after this pass (stayed, or slot on their own start)
 */
function pass(order, standingOut, fixedIn, o, clock) {
  const { walkable, route, walk = null } = o;
  const entries = {};
  const given = [];              // { x, y, r, id }: slots already given out
  const routes = [];             // { points, r, id }: routes already given out
  const standing = [...standingOut];
  const fixed = new Map(fixedIn);
  for (const m of order) if (fixedIn.has(m.id)) {
    standing.push({ x: m.start.x, y: m.start.y, r: m.r, id: m.id });
    const why = fixedIn.get(m.id);
    entries[m.id] = why ? { slot: { ...m.start }, points: [m.start], stay: why } : { slot: { ...m.start }, points: [m.start], atStart: true };
  }
  for (const m of order) {
    if (fixedIn.has(m.id)) continue;
    const t0 = clock();
    // The tokens standing round it (a circle it starts inside it is leaving: routeEnters lets it out).
    const hard = standing.filter(s => s.id !== m.id);
    const free = c => clearOf(c, m.r, hard) && clearOf(c, m.r, given)
      && routes.every(rt => wayToPoint(rt.points, c) >= m.r + rt.r - EPS);
    // Where it stands is its spot only when that is within a square of its formation spot (dropped about where it
    // stands); farther, staying there is a stay, and it is named.
    const homeOk = dist(m.start, m.formation) < 1 - EPS;
    let picked = null, why = "noSpot", tried = 0;
    for (const c of candidatesFor(m, o.rings ?? FILE.rings, walk, o.anchor ?? null)) {
      if (tried >= (o.tries ?? FILE.tries)) break;
      if (clock() - t0 > (o.memberMs ?? FILE.memberMs) || clock() - o.t0 > (o.totalMs ?? FILE.totalMs)) { why = "budget"; break; }
      const home = dist(c, m.start) < EPS;
      if (home && !homeOk) continue;
      if (!free(c) || !walkable(m, c)) continue;
      // Already there: no route to find.
      if (home) { picked = { slot: c, points: [m.start] }; break; }
      tried += 1;
      const avoid = [...hard, ...given];
      let pts = null;
      try { pts = route(m, m.start, c, avoid); } catch { pts = null; }
      if (!(pts?.length >= 2) || dist(pts.at(-1), c) > 0.05) { why = "noRoute"; continue; }
      // Its own word only: the route must not enter a standing token or a slot given out (after leaving one it starts in).
      if (routeEnters(pts, m.r, avoid)) { why = "through"; continue; }
      picked = { slot: c, points: pts };
      break;
    }
    if (!picked || picked.points.length < 2) {
      // It stays (named), or its slot is where it stands: either way the members after it walk round it.
      entries[m.id] = picked ? { slot: picked.slot, points: picked.points, atStart: true } : { slot: { ...m.start }, points: [m.start], stay: why };
      fixed.set(m.id, picked ? null : why);
      standing.push({ x: m.start.x, y: m.start.y, r: m.r, id: m.id });
      continue;
    }
    entries[m.id] = { slot: picked.slot, points: picked.points, walk: pathLength(picked.points) };
    given.push({ x: picked.slot.x, y: picked.slot.y, r: m.r, id: m.id });
    routes.push({ points: picked.points, r: m.r, id: m.id });
  }
  return { entries, fixed };
}

/** One order to the fixed point: every pass fixes at least one more member where it stands, or it is the last. */
function settleOrder(order, standing, o, now) {
  let fixed = new Map();
  let out = null, passes = 0, first = null;
  for (;;) {
    passes += 1;
    out = pass(order, standing, fixed, o, now);
    first ??= order.map(m => m.id).filter(id => out.entries[id]?.stay && out.entries[id].stay !== "budget");
    if (out.fixed.size === fixed.size || passes > order.length + 1) break;
    fixed = out.fixed;
  }
  const sent = order.filter(m => out.entries[m.id]?.points.length >= 2).length;
  const stayed = order.map(m => m.id).filter(id => out.entries[id]?.stay);
  return { entries: out.entries, passes, sent, stayed, first, order: order.map(m => m.id) };
}

/**
 * Plan B0.
 * @param {{ id, r, w?, h?, start: {x,y}, formation: {x,y} }[]} spec.members
 * @param {string} [spec.anchorId]            the grabbed one
 * @param {{x,y,r,id?}[]} [spec.standing]     tokens standing outside the drop
 * @param {object} o oracles
 * @param {(m, c) => boolean} o.walkable      can m stand with its centre at c?
 * @param {(m, from, to, avoid) => {x,y}[]|null} o.route  a route (centres) round `avoid` circles ({ x, y, r }: the
 *                                            obstacle's own radius; the oracle adds m's), or null
 * @param {(m, c) => number|null} [o.walk]   squares walked from m's formation spot to c, or null (unreachable): the
 *                                            spots are tried nearest by walking, never one round the far side of a wall
 * @param {() => number} [o.now]              the plan's clock (ms)
 * @returns {{ members: Object<string, { slot, points, stay?, atStart? }>, order: string[], stayed: string[], passes: number,
 *            tries: number, ms: number }}  `stayed`: the members named (they stay where they stand)
 *
 * A member that stays because the slots given out before it close its way (a spot at a door's mouth) is tried again
 * planned first, and most walk left first (FILE.reorders orders at most, within half the time budget): the order that
 * sends the most members wins, on a tie the one that rests the grabbed one nearest its drop point.
 */
export function planFile(spec, o) {
  const now = o.now ?? (() => 0);
  const t0 = now();
  const members = spec.members ?? [];
  const standing = (spec.standing ?? []).map(s => ({ x: s.x, y: s.y, r: s.r, id: s.id ?? null }));
  const oo = { ...o, t0, anchor: members.find(m => m.id === spec.anchorId) ?? null };
  const order = orderOf(members, spec.anchorId ?? null);
  let best = settleOrder(order, standing, oo, now), tries = 1;
  const seen = new Set([best.order.join(",")]);
  // More members sent wins; on a tie, the grabbed one nearer where it was dropped.
  const anchor = members.find(m => m.id === spec.anchorId) ?? null;
  const off = r => (anchor && r.entries[anchor.id]?.points.length >= 2 ? dist(r.entries[anchor.id].slot, anchor.formation) : Infinity);
  const better = next => next.sent > best.sent || (next.sent === best.sent && off(next) < off(best) - EPS);
  // Other orders, while members stay and there is time: the ones that stayed in the first pass planned first (the
  // slots given out before them closed their way), then most walk left first (the deepest goes first through a door).
  const others = [
    () => { const st = new Set(best.first); return [...order.filter(m => st.has(m.id)), ...order.filter(m => !st.has(m.id))]; },
    () => [...members].sort((a, b) => dist(b.start, b.formation) - dist(a.start, a.formation) || (a.id < b.id ? -1 : 1)),
    // The same, the grabbed one first among those that did not stay (it owns the drop point).
    () => { const st = new Set(best.first); const rest = order.filter(m => !st.has(m.id));
      return [...order.filter(m => st.has(m.id)), ...rest.sort((a, b) => (a.id === anchor?.id ? -1 : b.id === anchor?.id ? 1 : 0))]; },
  ];
  for (const make of others) {
    if (!best.stayed.length || tries > (o.reorders ?? FILE.reorders) || now() - t0 >= (o.totalMs ?? FILE.totalMs) / 2) break;
    const next0 = make();
    const key = next0.map(m => m.id).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    tries += 1;
    const next = settleOrder(next0, standing, oo, now);
    if (better(next)) best = next;
  }
  return { members: best.entries, order: best.order, stayed: best.stayed, passes: best.passes, tries, ms: Math.round((now() - t0) * 10) / 10 };
}

/* -------------------------------------------- */
/*  B1, the file: capped start delays (step 3)  */
/* -------------------------------------------- */

/**
 * B1's timing (Fable's review 2 §2 "Tier B, the file", §4 step 3). Every start delay is a multiple of `stepMs` (one
 * wave each), and the last one is at most `capMs` after the drop: within 4 s of the drop every member's move is on the
 * server (the one rule). Never a cut and never a second pass: a member that finds no clear delay under the cap takes
 * the one it meets fewest walkers at (soft: two movers may brush, Joe 2026-11-24); its route and slot stay B0's, so
 * nothing hard depends on the timing.
 */
export const STAGGER = Object.freeze({ capMs: 4000, stepMs: MOTION.waveMs });

/** Axis-aligned box of a trajectory's points, grown by `pad`. */
function boxOf(pts, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
const boxesMeet = (a, b) => !(a.x0 > b.x1 || b.x0 > a.x1 || a.y0 > b.y1 || b.y0 > a.y1);

/**
 * The start delays of a file.
 * @param {{ id: string, r: number, points: {x,y}[], speed?: number }[]} walks  the members that move, in B0's plan
 *        order (the grabbed one first, then least walk left first); centres in squares, speed in squares per second
 * @param {{ capMs?: number, stepMs?: number, gap?: number }} [o]  capMs: the latest start (ms after the drop)
 * @returns {{ delays: Object<string, number>, order: string[], total: number, crowded: string[] }}
 *          order: the start order (sequence-core: never one walking through another standing at its start, nor into
 *          another resting at its end, when an order exists; plan order otherwise); total: the largest delay;
 *          crowded: the members that found no clear delay under the cap (they go at the least crowded one)
 *
 * Each member in that order takes the first delay at which it meets none of the members already timed: as they are
 * drawn from the same update (one wave, no latency buffer), or one wave apart (MOTION.motionGap either way along its
 * way). A member whose walk never comes near another's (open ground) goes at 0.
 */
export function staggerFile(walks, o = {}) {
  const cap = Math.max(0, o.capMs ?? STAGGER.capMs);
  const step = Math.max(1, o.stepMs ?? STAGGER.stepMs);
  const gap = o.gap ?? MOTION.motionGap;
  const list = (walks ?? []).filter(w => w?.id && w.points?.length >= 2);
  const byId = new Map(list.map(w => [w.id, w]));
  const order = sequence(list).order;
  const steps = [];
  for (let d = 0; d <= cap + EPS; d += step) steps.push(d);
  const fixed = [];               // { tr, r, d, box }
  const delays = {}, crowded = [];
  for (const id of order) {
    const w = byId.get(id);
    const tr = trajectory(w.points, { speed: w.speed ?? MOTION.speed });
    const box = boxOf(tr.pts, w.r + gap);
    const near = fixed.filter(f => boxesMeet(box, f.box));
    let best = null;
    for (const d of steps) {
      const mine = delayed(tr, d);
      let n = 0;
      for (const f of near) if (firstConflict(mine, f.tr, w.r, f.r, { sameWave: Math.abs(f.d - d) < EPS, gap }) !== null) n += 1;
      if (best === null || n < best.n) best = { d, n };
      if (n === 0) break;
    }
    if (best.n > 0) crowded.push(id);
    delays[id] = best.d;
    fixed.push({ tr: delayed(tr, best.d), r: w.r, d: best.d, box: boxOf(tr.pts, w.r) });
  }
  const total = Object.values(delays).reduce((a, b) => Math.max(a, b), 0);
  return { delays, order, total, crowded };
}

/* -------------------------------------------- */
/*  A later wave, when it goes (0.9.0 step 5)   */
/* -------------------------------------------- */

/**
 * Who of a wave walks how far when it is sent (drop.mjs sendWave; the 0.9.0 simulator, step 5): to a fixed point, a
 * member whose way is shut now, or that is cut to nothing, stays (and stands in the others' way); one cut short rests
 * there (in the way of the ones after it); one whose rest would fall inside where an earlier one rests (it starts
 * inside it: they share a lane) goes before that one instead, or, once swapped, stays. Each round one more stays or
 * one pair swaps, so it ends; never a second plan. Units are the caller's.
 * @param {string[]} ids   this wave's members, in plan order
 * @param {object} o
 * @param {(id) => boolean} o.shut                 its way crosses a wall that blocks movement now
 * @param {(id) => {x,y,r}} o.at                    where it stands (a circle)
 * @param {(id, circles) => { way, end: {x,y,r}, short: boolean } | null} o.cut  its way walked only as far as it is
 *        free of `circles` (besides the caller's own obstacles): `end` where it then rests; null: not off its spot
 * @returns {{ ways: Map<string, *>, stays: string[] }}  ways: id → its way (as `cut` gave it), for the ones that go
 */
export function waveWays(ids, { shut, at, cut }) {
  const stays = new Set(), swapped = new Set();
  let order = [...ids], ways = new Map(), settled = false;
  for (let round = 0; round <= ids.length * (ids.length + 1) && !settled; round++) {
    const rests = order.filter(id => stays.has(id)).map(id => ({ ...at(id), by: id }));
    ways = new Map();
    settled = true;
    for (const id of order) {
      if (stays.has(id)) continue;
      if (shut(id)) { stays.add(id); settled = false; break; }
      const c = cut(id, rests);
      if (!c) { stays.add(id); settled = false; break; }
      const hit = rests.find(o => dist(o, c.end) < o.r + c.end.r - EPS);
      if (hit) {
        const key = `${id}>${hit.by}`;
        if (!stays.has(hit.by) && !swapped.has(key)) {
          swapped.add(key);
          order = order.filter(x => x !== id);
          order.splice(order.indexOf(hit.by), 0, id);
        } else stays.add(id);
        settled = false;
        break;
      }
      ways.set(id, c.way);
      if (c.short) rests.push({ ...c.end, by: id });
    }
  }
  if (!settled) ways = new Map();
  return { ways, stays: ids.filter(id => !ways.has(id)) };
}
