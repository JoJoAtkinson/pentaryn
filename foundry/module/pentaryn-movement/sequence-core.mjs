/**
 * Pure space-based separation for a fight's group move, pentaryn-movement 0.8.0 tier C (plan
 * context/plans/pathfinding-2026-11.md §16.2; Fable's review §1, Joe's decision 2026-11-23). No Foundry globals.
 *
 * Timing could not keep a fight's members apart: every square of a fight is a round trip from the client that started
 * it, plus fog stalls of 150-650 ms, so a member's place in time was never where the plan had it. Space can:
 *   - two members whose swept corridors (their way, as wide as the token) never meet go together;
 *   - otherwise the later one sets off on the earlier one's ARRIVAL (an event, never a clock);
 *   - which of a meeting pair goes first is decided by where they start and end: never one walking through the
 *     other standing at its start, never one walking into the other resting at its end. When neither order is safe
 *     (each one's way crosses the other's start or end), the later one in plan order stops short of the other's start
 *     and end (`cut`): stopping short beats overlapping.
 *
 * Units as motion-core.mjs: centres in grid squares. Touching is fine; coming inside is not.
 */

import { dist } from "./motion-core.mjs";

const EPS = 1e-6;

/** Distance from point p to segment a-b. */
function segPoint(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 > EPS ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }

/** Smallest distance between segments p1-p2 and q1-q2 (exact; 0 when they cross). */
export function segSeg(p1, p2, q1, q2) {
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return 0;
  return Math.min(segPoint(p1, q1, q2), segPoint(p2, q1, q2), segPoint(q1, p1, p2), segPoint(q2, p1, p2));
}

/** The segments of a way (a way of one point is that point). */
function segments(points) {
  if (!points?.length) return [];
  if (points.length === 1) return [[points[0], points[0]]];
  const out = [];
  for (let k = 1; k < points.length; k++) out.push([points[k - 1], points[k]]);
  return out;
}

/** Smallest distance between two ways. */
export function wayDistance(a, b) {
  let best = Infinity;
  for (const [p1, p2] of segments(a)) for (const [q1, q2] of segments(b)) best = Math.min(best, segSeg(p1, p2, q1, q2));
  return best;
}

/** Do the swept corridors of two walks ({ points, r }) meet (come inside touching)? */
export function corridorsMeet(a, b) {
  return wayDistance(a.points, b.points) < a.r + b.r - EPS;
}

/** Does a token of radius `rc` standing at `c` come inside the corridor of the walk `points` (radius `r`)? */
export function onWay(points, r, c, rc) {
  return wayDistance(points, [c]) < r + rc - EPS;
}

/**
 * Is it unsafe for `first` to walk its whole way, then `second`? `first` passing `second` standing at its start, or
 * `second` walking into `first` resting at its end.
 */
export function unsafeOrder(first, second) {
  return onWay(first.points, first.r, second.points[0], second.r) || onWay(second.points, second.r, first.points.at(-1), first.r);
}

/**
 * The sequence of a fight's group move.
 *
 * 1. Each meeting pair prefers the order that is safe (unsafeOrder); when neither is, plan order.
 * 2. A total start order honours those preferences (plan order first; a cycle is broken at its earliest member).
 * 3. Every member waits for the arrival of each member before it in that order whose corridor meets its own; the
 *    others set off together.
 * 4. Where an order is still unsafe (a cycle, or a pair with no safe order), cutsFor() stops the walk short.
 * @param {{ id: string, r: number, points: {x,y}[] }[]} walks  in plan order (a walk of one point does not move)
 * @returns {{ after: Object<string, string[]>, order: string[], together: string[] }}
 */
export function sequence(walks) {
  const list = (walks ?? []).filter(w => w?.id && w.points?.length >= 2);
  const meets = new Map(list.map(w => [w.id, new Set()]));
  const prefer = new Map(list.map(w => [w.id, new Set()]));     // id → ids it prefers to follow
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!corridorsMeet(a, b)) continue;
      meets.get(a.id).add(b.id);
      meets.get(b.id).add(a.id);
      if (!unsafeOrder(a, b) || unsafeOrder(b, a)) prefer.get(b.id).add(a.id);
      else prefer.get(a.id).add(b.id);
    }
  }
  const order = [];
  const done = new Set();
  const left = [...list];
  while (left.length) {
    let k = left.findIndex(w => [...prefer.get(w.id)].every(d => done.has(d)));
    if (k < 0) k = 0;
    const [w] = left.splice(k, 1);
    order.push(w.id);
    done.add(w.id);
  }
  const place = new Map(order.map((id, k) => [id, k]));
  const after = Object.fromEntries(order.map(id => [id, [...meets.get(id)].filter(o => place.get(o) < place.get(id))
    .sort((x, y) => place.get(x) - place.get(y))]));
  return { after, order, together: order.filter(id => !after[id].length) };
}

/**
 * Each walk cut where the sequence still leaves it unsafe, in start order: it stops short of the start of every later
 * member whose corridor meets its own (that one still stands there while it walks) and of the end of every earlier
 * one it waited for (that one rests there; its end as cut). `cutWay(points, r, circles)` cuts one way (the glue's
 * freePrefix on whole squares) and returns the points kept; it is called as cutWay(points, r, circles, id).
 * @returns {Object<string, {x,y}[]>} id → the points it walks (a single point: it does not move)
 */
export function cutsFor(walks, seq, cutWay) {
  const byId = new Map((walks ?? []).map(w => [w.id, w]));
  const kept = {};
  for (const id of seq.order) {
    const w = byId.get(id);
    if (!w) continue;
    const circles = [];
    for (const d of seq.after[id] ?? []) {
      const end = (kept[d] ?? byId.get(d)?.points)?.at(-1);
      if (end) circles.push({ x: end.x, y: end.y, r: byId.get(d).r });
    }
    for (const o of seq.order) {
      if (!(seq.after[o] ?? []).includes(id)) continue;
      const other = byId.get(o);
      if (other) circles.push({ x: other.points[0].x, y: other.points[0].y, r: other.r });
    }
    const live = circles.filter(c => onWay(w.points, w.r, c, c.r));
    kept[id] = live.length ? cutWay(w.points, w.r, live, id) : w.points;
  }
  return kept;
}

/**
 * Tokens that start stacked (a rider on its mount, a familiar on a shoulder, a grappled pair): circles that overlap by
 * more than `slack` squares. Returns groups of ids (union of overlapping pairs), each with its leader: the largest,
 * then `prefer` (the grabbed token), then list order. Singletons are left out.
 * @param {{ id: string, c: {x,y}, r: number, size?: number }[]} items
 */
export function stacksOf(items, { slack = 0.25, prefer = null } = {}) {
  const parent = new Map(items.map(i => [i.id, i.id]));
  const find = id => { let p = id; while (parent.get(p) !== p) p = parent.get(p); return p; };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (dist(a.c, b.c) < a.r + b.r - slack) parent.set(find(b.id), find(a.id));
    }
  }
  const groups = new Map();
  for (const it of items) {
    const root = find(it.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(it);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const size = it => it.size ?? it.r;
    const lead = [...g].sort((a, b) => size(b) - size(a) || (b.id === prefer) - (a.id === prefer) || g.indexOf(a) - g.indexOf(b))[0];
    out.push({ leader: lead.id, riders: g.filter(x => x !== lead).map(x => ({ id: x.id, dx: x.c.x - lead.c.x, dy: x.c.y - lead.c.y })) });
  }
  return out;
}

/**
 * The latency buffer a fight member keeps behind one walking ahead of it when it follows (0.8.3; squares,
 * either drawn this far ahead of or behind itself along its way, motion-core firstConflict's `gap`).
 */
export const FOLLOW_GAP = 0.75;
