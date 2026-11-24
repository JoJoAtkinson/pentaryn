// Narrow ways (R9) on pure geometry: a router built the way pathfind-adapter.mjs builds a 1×1 (or smaller) token's
// tests from a scene (the plain square test: one ray between square centres, no wall touched, the corner rule, out of
// combat a diagonal keeps its body clear of wall ends), with narrow-core's field and walk; a C-stair generator; and the
// independent checks the gates use (brute force over every wall, never the field's own index).
import * as pf from "../../pathfind-core.mjs";
import { narrowField, narrowMore, walkFor, NARROW } from "../../narrow-core.mjs";

/** A seeded generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cross = (p, q, a, b) => pf.segmentsCross(p, q, a, b);
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
const seg = w => [{ x: w[0], y: w[1] }, { x: w[2], y: w[3] }];

/**
 * A router over walls (squares, [[ax, ay, bx, by]]) for a token of `size` ≤ 1 (a bigger one: the plain test only, its
 * body footprint, no narrow field: decision 8). `standing`: circles { x, y, r } (squares) the token may not come
 * inside (tokens standing, as the adapter's avoid circles). `fight`: no rounding of diagonals, the walk's plain parts
 * on the squares. `limit`: the lattice bounds.
 */
export function router(walls, { size = 1, fight = false, standing = [], limit = null, lines = [], narrow = true } = {}) {
  const W = walls.map(seg);
  const pad = size / 2;
  // The lattice: the walls' box and a margin (the module's is the scene's rect, so a box search widens to it).
  if (!limit && walls.length) {
    const xs = walls.flatMap(w => [w[0], w[2]]), ys = walls.flatMap(w => [w[1], w[3]]);
    limit = { minI: Math.floor(Math.min(...ys)) - 2, maxI: Math.ceil(Math.max(...ys)) + 2, minJ: Math.floor(Math.min(...xs)) - 2, maxJ: Math.ceil(Math.max(...xs)) + 2 };
  }
  const blockedSq = n => {
    const c = { x: n.j + size / 2, y: n.i + size / 2 };
    return standing.some(s => Math.hypot(c.x - s.x, c.y - s.y) < s.r + pad - 1e-6);
  };
  // The footprint's square centres (a 2×2 at top-left (i, j) covers four).
  const foot = n => {
    const out = [];
    const k = Math.max(1, Math.round(size));
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) out.push({ x: n.j + b + 0.5 * (size < 1 ? size : 1), y: n.i + a + 0.5 * (size < 1 ? size : 1) });
    return out;
  };
  const ray = (p, q) => !W.some(([a, b]) => cross(p, q, a, b)) && !lines.some(l => cross(p, q, { x: l.c[0], y: l.c[1] }, { x: l.c[2], y: l.c[3] }) && !openFrom(l, p));
  const wall = (a, b) => { const fa = foot(a), fb = foot(b); return fa.every((p, k) => ray(p, fb[k])); };
  const ends = W.flatMap(([a, b]) => [a, b]);
  const clear = Math.max(size / 2 - 0.02, 0);
  const centre = n => ({ x: n.j + size / 2, y: n.i + size / 2 });
  const roundCorners = (a, b) => {
    if (!clear) return true;
    const p = centre(a), q = centre(b);
    for (const c of ends) {
      if (Math.hypot(c.x - p.x, c.y - p.y) < clear || Math.hypot(c.x - q.x, c.y - q.y) < clear) continue;
      if (segDist(c, p, q) < clear - 1e-9) return false;
    }
    return true;
  };
  const edge = (a, b) => {
    if (a.c || b.c) return null;
    if (blockedSq(b) || !wall(a, b)) return null;
    if (!fight && a.i !== b.i && a.j !== b.j && !roundCorners(a, b)) return null;
    return 1;
  };
  const lineOk = (a, b) => wall(a, b) && roundCorners(a, b) && !standing.some(s => segDist(s, centre(a), centre(b)) < s.r + pad - 1e-6);
  const field = narrow && size <= 1 ? narrowField(walls, { pad, lines }) : null;
  const more = field ? narrowMore(field, {
    toAbs: n => ({ I: n.i, J: n.j }), fromAbs: (I, J, c) => ({ i: I, j: J, c }), cost: () => 1, blocked: blockedSq,
  }) : null;
  const okSeg = (p, q) => !standing.some(s => segDist(s, p, q) < s.r + pad - 1e-6);

  /** A route from point `from` to point `to` (centres, squares). */
  const route = (from, to, { maxNodes = pf.LIMITS.maxNodes } = {}) => {
    const t0 = performance.now();
    const nodeOf = p => ({ i: Math.floor(p.y - size / 2 + 0.5), j: Math.floor(p.x - size / 2 + 0.5) });
    let start = nodeOf(from), goal = nodeOf(to);
    // A start or goal in a tight square is its part (component) there (pathfind.mjs does the same).
    if (field) {
      const s0 = field.tight(start.i, start.j) ? field.nodeAt(from) : null;
      if (s0) start = { i: s0.I, j: s0.J, c: s0.c };
      const g0 = field.tight(goal.i, goal.j) ? field.nodeAt(to) : null;
      if (g0) goal = { i: g0.I, j: g0.J, c: g0.c };
    }
    const job = pf.searchWide({ start, goal, edge, wall, unit: 1, maxNodes, more }, limit);
    const state = job.run();
    const searchMs = performance.now() - t0;
    if (state !== "found") return { found: false, state, ms: performance.now() - t0, searchMs, expanded: job.expanded };
    const path = job.path, costs = job.costs;
    // As pathfind.mjs: through a part of a tight square the narrow walk; on whole squares only, today's route unless
    // it passes a tight square closer than the pass radius (constraint 1).
    const parts = !!field && path.some(n => n.c);
    const plainOk = () => {
      const kept = pf.stringPull(path, costs, { edge, wall, lineOk });
      const pts = [from, ...kept.slice(1, -1).map(centre), to];
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k - 1], q = pts[k];
        const dp = field.clearance(p.x, p.y), dq = field.clearance(q.x, q.y);
        if (dp < field.passMin || dq < field.passMin || !field.segOk(p, dp, q, dq)) return false;
      }
      return true;
    };
    const touches = field && (parts || (path.some(n => field.tight(n.i, n.j)) && !plainOk()));
    let points, res = null;
    if (touches) {
      const pull = (k0, k1) => {
        const sub = path.slice(k0, k1 + 1), sc = costs.slice(k0, k1 + 1);
        const kept = pf.stringPull(sub, sc, { edge, wall, lineOk });
        return kept.map(n => k0 + sub.indexOf(n));
      };
      res = walkFor(field, path.map(n => ({ I: n.i, J: n.j, c: n.c ?? 0 })), { from, to, fight, pull, okSeg });
      if (!res) return { found: false, state: "walk", ms: performance.now() - t0, searchMs, expanded: job.expanded, path };
      points = res.points;
    } else {
      const kept = pf.stringPull(path, costs, { edge, wall, lineOk });
      points = [from, ...kept.slice(1, -1).map(centre), to];
    }
    return { found: true, points, narrow: !!res?.narrow, minClearance: res?.minClearance ?? null, settled: res?.settled ?? null,
      fine: !!touches, parts, path, cost: costs.at(-1), ms: performance.now() - t0, searchMs, expanded: job.expanded };
  };
  return { route, field, edge, wall };
}

function openFrom(l, p) {
  const c = l.c, d = Number(l.dir);
  if (!(d === 1 || d === 2)) return false;
  const o = (c[1] - p.y) * (c[2] - p.x) - (c[0] - p.x) * (c[3] - p.y);
  if (Math.abs(o) < 1e-12) return false;
  return (o < 0 ? 1 : 2) === d;
}

/* -------------------------------------------- */
/*  Independent checks                          */
/* -------------------------------------------- */

/** Samples of a polyline every `step`. */
export function samples(pts, step = NARROW.sample) {
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let s = k === 1 ? 0 : 1; s <= n; s++) out.push({ x: a.x + (b.x - a.x) * (s / n), y: a.y + (b.y - a.y) * (s / n) });
  }
  return out;
}

/** Brute force: the least distance from the polyline's samples to any wall, and whether a segment crosses one. */
export function judge(walls, pts, { skipEnds = 0 } = {}) {
  const W = walls.map(seg);
  let through = false;
  for (let k = 1; k < pts.length && !through; k++) if (W.some(([a, b]) => cross(pts[k - 1], pts[k], a, b))) through = true;
  const S = samples(pts);
  let min = Infinity;
  for (let k = 0; k < S.length; k++) {
    if (k < skipEnds || k >= S.length - skipEnds) continue;
    for (const [a, b] of W) min = Math.min(min, segDist(S[k], a, b));
  }
  return { through, minClearance: min, samples: S };
}

/**
 * The heading change between samples (R9's gate): the walk sampled every `step` along its length, the heading from
 * each sample to the next, and the turn (degrees) at each sample; the zigzags: two turns within `near` of each other
 * that go opposite ways, both over `deg` (an eighth-cell staircase turns 45° each way every 1/8 square; an S-bend at
 * a mouth turns a few degrees each way half a square apart).
 */
export function headings(pts, { step = NARROW.sample, near = 0.35, deg = 15 } = {}) {
  // Uniform samples along the polyline.
  const S = [{ x: pts[0].x, y: pts[0].y }];
  let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], L = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= L + 1e-12) { S.push({ x: a.x + (b.x - a.x) * (t / L), y: a.y + (b.y - a.y) * (t / L) }); t += step; }
    carry = L - (t - step);
  }
  const turns = [];
  for (let k = 1; k < S.length - 1; k++) {
    const a = S[k - 1], b = S[k], c = S[k + 1];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x), h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = (h2 - h1) * 180 / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    turns.push({ at: b, d });
  }
  // Opposite turns over `deg` within `near` along the walk.
  let zig = 0;
  const span = Math.max(1, Math.round(near / step));
  for (let k = 0; k < turns.length; k++) {
    if (Math.abs(turns[k].d) <= deg) continue;
    for (let m = k + 1; m < Math.min(turns.length, k + 1 + span); m++) {
      if (Math.abs(turns[m].d) > deg && Math.sign(turns[m].d) !== Math.sign(turns[k].d)) { zig += 1; break; }
    }
  }
  return { max: turns.reduce((m, t) => Math.max(m, Math.abs(t.d)), 0), zig, turns };
}

/* -------------------------------------------- */
/*  The C stair                                 */
/* -------------------------------------------- */

const e = t => ({ x: Math.cos(t), y: Math.sin(t) });

/**
 * A seeded C: two curved off-grid walls in segments of 8°–15°, the centre line's radius 3–8 squares, sweep 120°–270°,
 * narrowest width 0.3–1.0 square mid-way (1.0–1.25 at the mouths), a room at each end (4 × 4, off-grid, turned with the
 * C). Rejection-sampled until the rooms and the C do not overlap. { walls, inner, outer, rooms: [A, B], pick(room, r) }.
 */
export function cStair(seed, o = {}) {
  const r = rng(seed);
  for (let tries = 0; tries < 200; tries++) {
    const R = o.R ?? 3 + r() * 5;
    const sweep = (o.sweep ?? 120 + r() * 150) * Math.PI / 180;
    const stepDeg = o.stepDeg ?? 8 + r() * 7;
    const wmin = o.wmin ?? 0.3 + r() * 0.7;
    const wmouth = o.wmouth ?? 1 + r() * 0.25;
    const t0 = r() * 2 * Math.PI;
    const O = { x: 20 + r(), y: 20 + r() };
    const N = Math.max(2, Math.ceil((sweep * 180 / Math.PI) / stepDeg));
    const width = u => wmouth + (Math.min(wmin, wmouth) - wmouth) * Math.sin(Math.PI * u);
    const inner = [], outer = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N, t = t0 + sweep * u, w = width(u);
      // The outer wall's vertices stand out by 1 / cos(half a segment), so its chords keep outside the circle of
      // radius R + w / 2 and the clear width is never under w (the "narrowest width" is the true one).
      const ro = (R + w / 2) / Math.cos(sweep / N / 2);
      inner.push({ x: O.x + (R - w / 2) * Math.cos(t), y: O.y + (R - w / 2) * Math.sin(t) });
      outer.push({ x: O.x + ro * Math.cos(t), y: O.y + ro * Math.sin(t) });
    }
    const room = (u, dir) => {
      // The mouth line is radial at angle t; the room extends along `dir` (out of the C), 4 deep, 4 wide.
      const t = t0 + sweep * u, rad = e(t), w = width(u);
      const D = 4, Wd = 4;
      const P = rr => ({ x: O.x + rr * rad.x, y: O.y + rr * rad.y });
      const a = P(R - Wd / 2), b = P(R + Wd / 2);
      const off = p => ({ x: p.x + dir.x * D, y: p.y + dir.y * D });
      const gi = P(R - w / 2), go = P(R + w / 2);
      const ws = [[a, gi], [go, b], [b, off(b)], [off(b), off(a)], [off(a), a]];
      return { walls: ws, a, b, dir, rad, D, Wd, inside: (q, m = 0) => {
        const v = { x: q.x - a.x, y: q.y - a.y };
        const s = v.x * rad.x + v.y * rad.y, d = v.x * dir.x + v.y * dir.y;
        return s > m && s < Wd - m && d > m && d < D - m;
      } };
    };
    const tan = t => ({ x: -Math.sin(t), y: Math.cos(t) });
    const A = room(0, { x: -tan(t0).x, y: -tan(t0).y });
    const B = room(1, tan(t0 + sweep));
    // Overlaps: a room point in the C's band, or in the other room.
    let bad = false;
    const inBand = q => {
      const d = Math.hypot(q.x - O.x, q.y - O.y);
      if (d < R - 1.2 || d > R + 1.2) return false;
      let a = Math.atan2(q.y - O.y, q.x - O.x) - t0;
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return a > 0.02 && a < sweep - 0.02;
    };
    for (const [X, Y] of [[A, B], [B, A]]) {
      for (let s = 0.1; s < 4 && !bad; s += 0.2) for (let d = 0.1; d < 4 && !bad; d += 0.2) {
        const q = { x: X.a.x + X.rad.x * s + X.dir.x * d, y: X.a.y + X.rad.y * s + X.dir.y * d };
        if (inBand(q) || Y.inside(q, -0.6)) bad = true;
      }
    }
    if (bad) continue;
    const walls = [];
    for (let k = 1; k <= N; k++) {
      walls.push([inner[k - 1].x, inner[k - 1].y, inner[k].x, inner[k].y]);
      walls.push([outer[k - 1].x, outer[k - 1].y, outer[k].x, outer[k].y]);
    }
    for (const X of [A, B]) for (const [p, q] of X.walls) walls.push([p.x, p.y, q.x, q.y]);
    const pick = (X, m = 0.7) => {
      const s = m + r() * (X.Wd - 2 * m), d = m + r() * (X.D - 2 * m);
      return { x: X.a.x + X.rad.x * s + X.dir.x * d, y: X.a.y + X.rad.y * s + X.dir.y * d };
    };
    return { seed, R, sweep, stepDeg, wmin: Math.min(wmin, wmouth), wmouth, O, inner, outer, walls, rooms: [A, B], pick, width };
  }
  throw new Error(`cStair ${seed}: no layout`);
}

/** The C's centre-line error at p: half the difference of its distances to the two curved walls, and the width there. */
export function centreError(C, p) {
  const chain = pts => { let m = Infinity; for (let k = 1; k < pts.length; k++) m = Math.min(m, segDist(p, pts[k - 1], pts[k])); return m; };
  const di = chain(C.inner), dout = chain(C.outer);
  return { err: Math.abs(di - dout) / 2, width: di + dout, di, dout };
}

/** Is p inside the C's lane (between its walls, within its sweep)? */
export function inLane(C, p) {
  const d = Math.hypot(p.x - C.O.x, p.y - C.O.y);
  let a = Math.atan2(p.y - C.O.y, p.x - C.O.x) - Math.atan2(C.inner[0].y - C.O.y, C.inner[0].x - C.O.x);
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (a <= 0.01 || a >= C.sweep - 0.01) return false;
  const w = C.width(a / C.sweep);
  return d > C.R - w / 2 && d < C.R + w / 2;
}
