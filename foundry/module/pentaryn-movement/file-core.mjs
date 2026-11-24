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
 * Every member moves in one batched update with no stagger: two members both moving may brush (soft, Joe 2026-11-24);
 * a standing token, a slot and a rest overlap never (hard).
 *
 * Units: centres in grid squares (as motion-core). Touching is fine; coming inside is not.
 */

import { dist } from "./motion-core.mjs";
import { cellCandidates, firstIntrusion, hexCandidates, pathLength } from "./group-core.mjs";

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
 */
export function candidatesFor(m, rings = FILE.rings, walk = null) {
  const f = m.formation;
  const w = m.w ?? 1, h = m.h ?? w;
  const tl = { x: f.x - w / 2, y: f.y - h / 2 };
  const onGrid = Math.abs(tl.x - Math.round(tl.x)) < EPS && Math.abs(tl.y - Math.round(tl.y)) < EPS;
  const ring = onGrid || w > 1 || h > 1
    ? cellCandidates({ x: Math.round(tl.x), y: Math.round(tl.y) }, w, h, rings)
    : hexCandidates(f, 2 * m.r, 2 * rings);
  const all = [{ x: f.x, y: f.y }, ...ring];
  if (!walk) return all.sort((a, b) => dist(a, f) - dist(b, f));
  const keyed = [];
  for (const c of all) {
    let wd = null;
    try { wd = walk(m, c); } catch { wd = null; }
    if (wd === null || wd === undefined || wd > FILE.walkRatio * dist(c, f) + FILE.walkSlack + EPS) continue;
    keyed.push({ c, wd, d: dist(c, f) });
  }
  return keyed.sort((a, b) => a.wd - b.wd || a.d - b.d).map(k => k.c);
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
    for (const c of candidatesFor(m, o.rings ?? FILE.rings, walk)) {
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
  const oo = { ...o, t0 };
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
