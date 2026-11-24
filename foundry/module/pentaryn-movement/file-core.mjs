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
 *     only when it lies behind the leader's last step), so nobody rests beside or ahead of it.
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
function heap() {
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
 * Plan a group drag by the leader rule.
 * @param {object} spec
 * @param {{ id, r, w?, h?, start: {x,y} }[]} spec.members  one entry a stack (its leader); the leader among them
 * @param {string} spec.leaderId                the token grabbed (a rider's mount)
 * @param {{x,y}} spec.drop                     the leader's drop centre (march)
 * @param {{ id?, x, y, w?, h? }|null} [spec.target]  swarm: the token dropped on (its centre and size)
 * @param {{x,y,r,id?}[]} [spec.standing]       tokens standing outside the group (the target among them)
 * @param {{ at: {x,y}, from: {x,y} }} [spec.leaderAt]  the leader already at rest at `at`, its last step from `from`
 *                                              (a fight's later turn); then it is not planned
 * @param {object} o oracles
 * @param {(m, c) => boolean} o.walkable        can m stand with its centre at c?
 * @param {(a, b) => boolean} o.step            is one step between neighbouring squares a → b open (walls only)?
 * @param {(m, from, to, avoid) => {x,y}[]|null} [o.route]  a route (centres) round `avoid` circles (their own radius;
 *                                              the oracle adds m's), or null. Without it the slots are picked and
 *                                              nothing is searched (a fight routes at its turn).
 * @param {() => number} [o.now]                the plan's clock (ms)
 * @returns {{ shape: "march"|"swarm", leader: string, target: string|null, none: boolean,
 *            members: Object<string, { slot, points, stay?, rank?, atStart? }>, order: string[], stayed: string[],
 *            searches: number, failed: number, ms: number, behind: {x,y}|null, lastStep: {x,y}|null }}
 *          none: the leader has no way (nobody moves, "No route there"); stayed: the members named
 */
export function planLead(spec, o) {
  const now = o.now ?? (() => 0);
  const t0 = now();
  const members = (spec.members ?? []).map(m => ({ ...m, w: m.w ?? 1, h: m.h ?? m.w ?? 1 }));
  const byId = new Map(members.map(m => [m.id, m]));
  const L = byId.get(spec.leaderId) ?? members[0];
  const standing = (spec.standing ?? []).map(s => ({ x: s.x, y: s.y, r: s.r, id: s.id ?? null }));
  const target = spec.target ?? null;
  const shape = target ? "swarm" : "march";
  const out = { shape, leader: L?.id ?? null, target: target?.id ?? null, none: false, members: {}, order: [], stayed: [],
    searches: 0, failed: 0, ms: 0, behind: null, lastStep: null };
  if (!L) return out;
  const route = o.route ?? null;
  const n = members.length;
  const flood = { maxCells: (o.cells ?? LEAD.cells) * n + (o.extra ?? LEAD.extra), maxWalk: o.maxWalk ?? LEAD.maxWalk };
  const overStanding = c => standing.some(s => dist(cellCentre(c), s) < s.r + 0.5 - EPS);
  const claims = [];                      // { x, y, r, id }: slots given out
  const stays = [];                       // { x, y, r, id }: members that stay where they stand
  const blockedBy = list => c => list.some(s => dist(cellCentre(c), s) < s.r + 0.5 - EPS);
  const finish = () => { out.ms = Math.round((now() - t0) * 10) / 10; return out; };
  const search = (m, to, avoid) => {
    out.searches += 1;
    let pts = null;
    try { pts = route(m, m.start, to, avoid); } catch { pts = null; }
    const ok = pts?.length >= 2 && dist(pts.at(-1), to) <= 0.05 && !routeEnters(pts, m.r, avoid);
    if (!ok) { out.failed += 1; return null; }
    return pts;
  };
  const everyoneStays = why => {
    out.none = true;
    for (const m of members) { out.members[m.id] = { slot: { ...m.start }, points: [m.start], stay: why }; }
    out.stayed = members.map(m => m.id);
    out.order = [L.id, ...members.filter(m => m !== L).map(m => m.id)];
    return finish();
  };

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
  let leaderEntry = null;
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
          const pts = search(L, slot, standing);
          if (!pts) return everyoneStays("noRoute");
          out.members[L.id] = { slot, points: pts, walk: pathLength(pts) };
        }
      }
      at = slot;
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
      let worst = -Infinity, all = true;
      for (let a = 0; a < m.h && all; a++) for (let b = 0; b < m.w; b++) {
        const v = rank.get(cellKey(c.i + a, c.j + b));
        if (v === undefined) { all = false; break; }
        worst = Math.max(worst, v);
      }
      if (all) out2.push({ c, k, rank: worst, centre: { x: c.j + m.w / 2, y: c.i + m.h / 2 } });
    }
    return out2;
  };
  const stayHere = (m, why) => {
    out.members[m.id] = { slot: { ...m.start }, points: [m.start], stay: why };
    const me = { x: m.start.x, y: m.start.y, r: m.r, id: m.id };
    stays.push(me);
    // A slot given out where it stands: that member stays too. A route given out through it: round it, else stays.
    for (const [id, e] of Object.entries(out.members)) {
      if (id === m.id || e.stay) continue;
      const other = byId.get(id);
      if (dist(e.slot, me) < other.r + me.r - EPS) { drop(id); stayHere(other, "blocked"); continue; }
      if (e.points?.length >= 2 && routeEnters(e.points, other.r, [me])) {
        const avoid = id === L.id && !target ? [...standing, ...stays] : [...standing, ...claims.filter(c => c.id !== id), ...stays];
        const pts = route ? search(other, e.slot, avoid) : null;
        if (pts) { e.points = pts; e.walk = pathLength(pts); } else { drop(id); stayHere(other, "noRoute"); }
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
    const m = queue.shift();
    out.order.push(m.id);
    if (now() - t0 > (o.totalMs ?? LEAD.totalMs)) { stayHere(m, "budget"); continue; }
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
      .sort((a, b) => a.rank - b.rank || a.wd - b.wd || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    let picked = null, tries = 0, why = cands.length ? "noRoute" : "noSpot";
    // The leader of a swarm walks through its own group; everyone else round the slots given out and the stays.
    const avoid = m === L ? [...standing, ...stays] : avoidAll;
    for (const s of cands) {
      if (!clearOf(s.centre, m.r, avoidAll) || !o.walkable(m, s.centre)) continue;
      if (dist(s.centre, m.start) < EPS) { picked = { slot: s.centre, points: [m.start], atStart: true, rank: s.rank }; break; }
      if (!route) { picked = { slot: s.centre, points: null, rank: s.rank }; break; }
      if (tries >= (o.tries ?? LEAD.tries)) break;
      tries += 1;
      const pts = search(m, s.centre, avoid);
      if (pts) { picked = { slot: s.centre, points: pts, rank: s.rank, walk: pathLength(pts) }; break; }
    }
    if (!picked) {
      if (m === L) return everyoneStays("noRoute");
      stayHere(m, why);
      continue;
    }
    out.members[m.id] = picked;
    claims.push({ x: picked.slot.x, y: picked.slot.y, r: m.r, id: m.id });
    makeRoom(picked.slot, m.r);
  }
  if (out.members[L.id]?.stay) return everyoneStays("noRoute");
  out.stayed = out.order.filter(id => out.members[id]?.stay);
  return finish();
}
