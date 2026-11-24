/**
 * Pure helpers shared by the drop, the file and the stop (pentaryn-movement 0.9). No Foundry globals. Units as
 * motion-core.mjs: centres in grid squares. Candidate lattices round a spot, a route cut short, the walk-distance
 * flood and the one-Ctrl+Z history merge. (0.9: the 0.4 to 0.8 group planner, settle, the reslot and the rest
 * passes are gone; the file's own planning is file-core.mjs, plan context/plans/pathfinding-2026-11.md §17.)
 */

import { dist } from "./motion-core.mjs";

/** Candidate rings round a spot. */
export const GROUP_LIMITS = Object.freeze({ rings: 5 });

const EPS = 1e-6;

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

/**
 * One Ctrl+Z for one move (0.8.3, AR1-05 / AR1-06): merge a token layer's undo entries (core's `history`: { type,
 * data, options }) tagged `pmKey === key` among the last `scan` into one, at the place of the newest. Each token's
 * data and undo movement come from its first entry (where the move found it, its movement history as it was then).
 * Returns how many entries were merged (0: fewer than two).
 */
export function coalesceHistory(hist, key, scan = 60) {
  if (!Array.isArray(hist)) return 0;
  const idx = [];
  for (let i = Math.max(0, hist.length - scan); i < hist.length; i++) if (hist[i]?.pmKey === key) idx.push(i);
  if (idx.length < 2) return 0;
  const data = new Map();
  const movement = {};
  const extra = {};
  for (const i of idx) {
    const e = hist[i];
    for (const d of e.data ?? []) {
      if (data.has(d._id)) continue;
      data.set(d._id, d);
      if (e.options?.movement?.[d._id]) movement[d._id] = e.options.movement[d._id];
    }
    for (const [k, v] of Object.entries(e.options ?? {})) if (k !== "movement" && !(k in extra)) extra[k] = v;
  }
  const merged = { type: "update", data: [...data.values()], options: { ...extra, movement, diff: false, animate: false } };
  Object.defineProperty(merged, "pmKey", { value: key, writable: true, enumerable: false });
  const at = idx.at(-1) - (idx.length - 1);
  for (const i of [...idx].reverse()) hist.splice(i, 1);
  hist.splice(at, 0, merged);
  return idx.length;
}
