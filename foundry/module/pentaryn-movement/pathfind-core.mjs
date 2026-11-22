/**
 * Pure pathfinding for pentaryn-movement (plan context/plans/pathfinding-2026-11.md). No Foundry
 * globals: `node test/run.mjs` imports this bare.
 *
 * Three steps, each over an abstract square lattice whose nodes are `{ i, j }` (i = row, j = column,
 * Foundry's GridOffset2D convention). The Foundry side (pathfind-adapter.mjs) supplies the tests:
 *
 *   1. search()      8-connected A* with a binary heap. `edge(a, b)` returns the cost of one step
 *                    (a number) or null when it is blocked. The heuristic is Chebyshev × the unit
 *                    cost, which never overestimates; equal-cost routes are broken by the shorter
 *                    Euclidean length, so the raw path is the straightest of the cheapest ones.
 *                    A diagonal must not squeeze between two blocked sides (`wall(a, b)`, walls only).
 *   2. stringPull()  skip ahead to the farthest node whose straight line is open AND costs no more than
 *                    the A* path it replaces. The line is checked square by square with the same
 *                    edge rules (so it can never slip a wall joint) and then as a whole (`line`).
 *   3. fillet()      round each corner of the pulled polyline with a circular arc tangent to both
 *                    legs, sampled every ≤ 40°. A candidate radius is halved until the arc is clear
 *                    (`clear`) and its measured cost (`cost`) is no more than the sharp corner's;
 *                    otherwise the corner stays sharp. Movement cost stays measured in grid squares.
 */

export const PATHFIND_MODES = Object.freeze(["everyone", "gm", "off"]);
export const DEFAULT_PATHFIND = "everyone";

/** Search limits. A search past MAX_NODES expansions gives up (the drag then stops at the wall, as core does). */
export const LIMITS = Object.freeze({
  maxNodes: 6000,
  sliceMs: 8,          // one synchronous slice; a longer search continues in timer slices
  totalMs: 1500,       // wall-clock cap for one search, all slices
  margin: 8,           // cells around the start/goal box the search may use
  arcStepDeg: 40,      // fillet sampling
  arcMaxCells: 2,      // largest fillet tangent length, in cells
  arcTries: 4,         // halvings of the tangent length before a corner stays sharp
});

const EPS = 1e-6;
const key = n => `${n.i},${n.j}`;
export const nodeKey = key;
export const edgeKey = (a, b) => `${a.i},${a.j}>${b.i},${b.j}`;

/** The eight neighbour steps, orthogonal first (a stable expansion order makes ties deterministic). */
const STEPS = Object.freeze([
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]);

/** Chebyshev distance in cells. */
export const chebyshev = (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
export const euclid = (a, b) => Math.hypot(a.i - b.i, a.j - b.j);

/**
 * Foundry's square-grid direct path between two offsets (the Bresenham walk of
 * SquareGrid#getDirectPath, diagonals allowed). Includes both ends. The adapter uses Foundry's own;
 * this copy is what the pure tests and the line check walk.
 */
export function directPath(a, b) {
  let i0 = a.i, j0 = a.j;
  const { i: i1, j: j1 } = b;
  const path = [{ i: i0, j: j0 }];
  if (i0 === i1 && j0 === j1) return path;
  const di = Math.abs(i0 - i1);
  const dj = 0 - Math.abs(j0 - j1);
  const si = i0 < i1 ? 1 : -1;
  const sj = j0 < j1 ? 1 : -1;
  let e = di + dj;
  for (;;) {
    const e2 = e * 2;
    if (e2 >= dj) { e += dj; i0 += si; }
    if (e2 <= di) { e += di; j0 += sj; }
    path.push({ i: i0, j: j0 });
    if (i0 === i1 && j0 === j1) break;
  }
  return path;
}

/* -------------------------------------------- */
/*  Binary heap                                 */
/* -------------------------------------------- */

class Heap {
  constructor(less) { this.a = []; this.less = less; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!this.less(a[k], a[p])) break;
      [a[k], a[p]] = [a[p], a[k]];
      k = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === k) break;
        [a[k], a[m]] = [a[m], a[k]];
        k = m;
      }
    }
    return top;
  }
}

/* -------------------------------------------- */
/*  1. A*                                       */
/* -------------------------------------------- */

/**
 * Is the diagonal a→b allowed by the corner rule? At least one of the two orthogonal two-step
 * routes around it must be open to walls (`wall(x, y)` true = open). A diagonal between two walls
 * that meet at the corner is refused; one past a single wall end is allowed.
 */
export function cornerOk(a, b, wall) {
  if (a.i === b.i || a.j === b.j) return true;
  const s1 = { i: b.i, j: a.j };
  const s2 = { i: a.i, j: b.j };
  return (wall(a, s1) && wall(s1, b)) || (wall(a, s2) && wall(s2, b));
}

/**
 * A resumable A* search from `start` to `goal`.
 *
 * @param {object} spec
 * @param {{i,j}} spec.start
 * @param {{i,j}} spec.goal
 * @param {(a, b) => number|null} spec.edge       cost of one step, null when blocked
 * @param {(a, b) => boolean} [spec.wall]          walls only, for the corner rule (default: edge !== null)
 * @param {number} [spec.unit=1]                    the cheapest step's cost (heuristic scale)
 * @param {{minI,maxI,minJ,maxJ}} [spec.bounds]     nodes outside are never expanded
 * @param {number} [spec.maxNodes]
 * @param {() => number} [spec.now]                 clock for the time slices (ms)
 * @returns {{ run(budgetMs?: number): "found"|"none"|"more", path: {i,j}[]|null, costs: number[]|null, expanded: number }}
 */
export function search(spec) {
  const { start, goal, edge, unit = 1, bounds = null, maxNodes = LIMITS.maxNodes, now = () => 0 } = spec;
  const wall = spec.wall ?? ((a, b) => edge(a, b) !== null);
  const goalKey = key(goal);
  const nodes = new Map();       // key → { n, g, e, parent, closed }
  const less = (x, y) => (x.f < y.f - EPS) || (Math.abs(x.f - y.f) <= EPS && x.fe < y.fe - EPS);
  const open = new Heap(less);
  const h = n => chebyshev(n, goal) * unit;
  const inBounds = n => !bounds || (n.i >= bounds.minI && n.i <= bounds.maxI && n.j >= bounds.minJ && n.j <= bounds.maxJ);

  const s = { n: start, g: 0, e: 0, parent: null, closed: false };
  nodes.set(key(start), s);
  open.push({ rec: s, f: h(start), fe: euclid(start, goal) });

  const job = { path: null, costs: null, expanded: 0, state: "more" };

  const finish = rec => {
    const path = [], costs = [];
    for (let r = rec; r; r = r.parent) { path.push(r.n); costs.push(r.g); }
    job.path = path.reverse();
    job.costs = costs.reverse();
    job.state = "found";
  };

  job.run = (budgetMs = Infinity) => {
    if (job.state !== "more") return job.state;
    const t0 = now();
    let here = 0;                                  // expansions in this slice: every slice makes progress
    while (open.size) {
      if (job.expanded >= maxNodes) return (job.state = "none");
      if (budgetMs !== Infinity && here > 0 && (here & 31) === 0 && now() - t0 > budgetMs) return "more";
      here += 1;
      const { rec } = open.pop();
      if (rec.closed) continue;
      rec.closed = true;
      job.expanded += 1;
      if (key(rec.n) === goalKey) { finish(rec); return job.state; }
      for (const [di, dj] of STEPS) {
        const m = { i: rec.n.i + di, j: rec.n.j + dj };
        if (!inBounds(m)) continue;
        const mk = key(m);
        const old = nodes.get(mk);
        if (old?.closed) continue;
        const c = edge(rec.n, m);
        if (c === null || c === undefined || !Number.isFinite(c)) continue;
        if (di && dj && !cornerOk(rec.n, m, wall)) continue;
        const g = rec.g + c;
        const e = rec.e + Math.hypot(di, dj);
        if (old && (g > old.g + EPS || (Math.abs(g - old.g) <= EPS && e >= old.e - EPS))) continue;
        const r = old ?? { n: m, closed: false };
        r.g = g; r.e = e; r.parent = rec;
        nodes.set(mk, r);
        open.push({ rec: r, f: g + h(m), fe: e + euclid(m, goal) });
      }
    }
    return (job.state = "none");
  };
  return job;
}

/* -------------------------------------------- */
/*  2. String pulling                           */
/* -------------------------------------------- */

/**
 * Cost of walking a→b square by square along the direct path, with the same edge and corner rules
 * as the search; null when any square step is blocked.
 */
export function chainCost(a, b, { edge, wall, line = directPath }) {
  const cells = line(a, b);
  let total = 0;
  for (let k = 1; k < cells.length; k++) {
    const p = cells[k - 1], q = cells[k];
    const c = edge(p, q);
    if (c === null || c === undefined || !Number.isFinite(c)) return null;
    if (p.i !== q.i && p.j !== q.j && !cornerOk(p, q, wall ?? ((x, y) => edge(x, y) !== null))) return null;
    total += c;
  }
  return total;
}

/**
 * Cost-preserving string pulling. From each kept node, extend the straight line node by node while
 * it stays open (`chainCost` and, when given, `lineOk(a, b)` — the real ray and creature test of the
 * whole line) and no dearer than the A* path it replaces; keep the last one that passed.
 *
 * @param {{i,j}[]} path     A* nodes, start first
 * @param {number[]} costs   cumulative A* cost at each node
 * @returns {{i,j}[]}        the kept nodes, start and goal included
 */
export function stringPull(path, costs, { edge, wall, lineOk = null, line = directPath } = {}) {
  if (!path || path.length <= 2) return path ? [...path] : [];
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    for (let k = i + 2; k < path.length; k++) {
      const c = chainCost(path[i], path[k], { edge, wall, line });
      if (c === null || c > costs[k] - costs[i] + EPS) break;
      if (lineOk && !lineOk(path[i], path[k])) break;
      best = k;
    }
    out.push(path[best]);
    i = best;
  }
  return out;
}

/* -------------------------------------------- */
/*  3. Fillets (arcs at corners)                */
/* -------------------------------------------- */

/**
 * The arc points that replace corner B of A→B→C, for tangent length t (same units as the points).
 * Returns [T1, …, T2] or null when there is no turn (collinear) or t does not fit.
 */
export function filletPoints(A, B, C, t, stepDeg = LIMITS.arcStepDeg, { maxError = null } = {}) {
  const ux = B.x - A.x, uy = B.y - A.y;
  const vx = C.x - B.x, vy = C.y - B.y;
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (lu < EPS || lv < EPS) return null;
  const dux = ux / lu, duy = uy / lu, dvx = vx / lv, dvy = vy / lv;
  const cross = dux * dvy - duy * dvx;
  const dot = dux * dvx + duy * dvy;
  const theta = Math.atan2(Math.abs(cross), dot);           // turning angle, 0..π
  if (theta < 1e-3 || theta > Math.PI - 1e-3) return null;  // straight on, or a U-turn
  if (t > lu + EPS || t > lv + EPS) return null;           // fillet() keeps t within the legs it may use
  const r = t / Math.tan(theta / 2);
  const T1 = { x: B.x - dux * t, y: B.y - duy * t };
  // Centre: from T1, perpendicular toward the inside of the turn.
  const side = cross > 0 ? 1 : -1;
  const nx = -duy * side, ny = dux * side;
  const O = { x: T1.x + nx * r, y: T1.y + ny * r };
  const a0 = Math.atan2(T1.y - O.y, T1.x - O.x);
  let n = Math.max(2, Math.ceil((theta * 180 / Math.PI) / stepDeg));
  if (maxError) n = Math.max(n, arcSegments(theta, r, maxError));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + side * theta * (k / n);
    pts.push({ x: O.x + Math.cos(a) * r, y: O.y + Math.sin(a) * r });
  }
  return pts;
}

/**
 * Chords needed so a turn of `theta` radians on radius `r` stays within `maxError` of the circle (the
 * sagitta r·(1 − cos(θ / 2n)) of each chord). Same units for r and maxError.
 */
export function arcSegments(theta, r, maxError) {
  if (!(r > 0) || !(maxError > 0) || !(theta > 0)) return 1;
  if (maxError >= r) return 1;
  const half = Math.acos(1 - maxError / r);                  // the largest half-angle one chord may span
  return Math.max(1, Math.ceil(theta / (2 * half) - 1e-9));
}

/**
 * Round the corners of a polyline. Each corner tries tangent lengths `t0, t0/2, …` (t0 = the
 * smallest of `maxT`, what is left of the incoming leg and half of the outgoing one, so two arcs
 * never overlap) and takes the first whose arc is clear and no dearer.
 *
 * @param {{x,y}[]} pts                                the pulled polyline (pixels)
 * @param {object} o
 * @param {number} o.maxT                              largest tangent length (pixels)
 * @param {(p, q) => boolean} o.clear                  is the straight move p→q open (walls, creatures, footprint)?
 * @param {(pts) => number|null} o.cost                measured cost of moving along pts (null = refused)
 * @param {number} [o.tries]
 * @param {number} [o.maxError]                        chord error bound (pixels): a finer arc where the radius needs it (0.4.0)
 * @param {number} [o.cornerPoints]                    at most this many points per arc, or the corner stays sharp
 * @param {number} [o.maxPoints]                       at most this many points in the whole route
 * @returns {{ points: {x,y,arc?:true}[], arcs: number }}
 */
export function fillet(pts, { maxT, clear, cost, tries = LIMITS.arcTries, stepDeg = LIMITS.arcStepDeg,
  maxError = null, cornerPoints = Infinity, maxPoints = Infinity }) {
  if (pts.length < 3) return { points: pts.map(p => ({ ...p })), arcs: 0 };
  const out = [{ ...pts[0] }];
  let arcs = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    // The previous corner's arc may have eaten up to half of this leg; start from the last point out.
    const A = out.at(-1), B = pts[k], C = pts[k + 1];
    const lu = Math.hypot(B.x - A.x, B.y - A.y);
    const lv = Math.hypot(C.x - B.x, C.y - B.y);
    let t = Math.min(maxT, lu, lv / 2);
    let placed = null;
    const sharp = cost([A, B, C]);
    for (let n = 0; n < tries && t > 1; n++, t /= 2) {
      const arc = filletPoints(A, B, C, t, stepDeg, { maxError });
      if (!arc) break;
      // 0.4.0 caps: points per arc, and the whole route (what is placed, this arc, one point per corner to come).
      // A smaller tangent needs fewer chords, so both try the next size.
      if (arc.length > cornerPoints) continue;
      if (out.length + arc.length + (pts.length - k - 1) > maxPoints) continue;
      const seq = [A, ...arc, C];
      let ok = true;
      for (let s = 1; s < seq.length && ok; s++) ok = clear(seq[s - 1], seq[s]);
      if (!ok) continue;
      const c = cost(seq);
      if (c === null || sharp === null || c > sharp + EPS) continue;
      placed = arc;
      break;
    }
    if (placed) {
      for (const p of placed) out.push({ ...p, arc: true });
      arcs += 1;
    } else out.push({ ...B });
  }
  out.push({ ...pts.at(-1) });
  return { points: out, arcs };
}

/* -------------------------------------------- */
/*  Rules the glue asks                         */
/* -------------------------------------------- */

/**
 * Should this drag be pathfound at all? Pure inputs, so every early return is a table row.
 * Returns null (go) or the reason it is skipped.
 */
export function skipReason({ mode, mine, isGM, gridType, constrain = {}, waypoints = 0 }) {
  const m = PATHFIND_MODES.includes(mode) ? mode : DEFAULT_PATHFIND;
  if (m === "off") return "off";
  if (m === "gm" && !isGM) return "gmOnly";
  if (!mine) return "client";
  if (gridType !== 1) return "grid";                 // square grids only (CONST.GRID_TYPES.SQUARE)
  if (constrain.ignoreWalls) return "unconstrained"; // GM unconstrained tool, or ghost
  if (waypoints < 2) return "short";
  return null;
}

/** Search bounds: the start/goal box plus a margin, clipped to the scene's lattice range. */
export function boundsFor(a, b, limit, margin = LIMITS.margin) {
  const pad = Math.max(margin, Math.ceil(chebyshev(a, b) / 2));
  const box = {
    minI: Math.min(a.i, b.i) - pad, maxI: Math.max(a.i, b.i) + pad,
    minJ: Math.min(a.j, b.j) - pad, maxJ: Math.max(a.j, b.j) + pad,
  };
  if (!limit) return box;
  return {
    minI: Math.max(box.minI, limit.minI), maxI: Math.min(box.maxI, limit.maxI),
    minJ: Math.max(box.minJ, limit.minJ), maxJ: Math.min(box.maxJ, limit.maxJ),
  };
}

/**
 * How many of `explicit` (in order) a found path passes through, matched by `same(a, b)` as core's
 * drag code matches them. A path that reaches them all needs no pathfinding.
 */
export function reachedCount(path, explicit, same) {
  let n = 0;
  for (const w of path ?? []) {
    if (n < explicit.length && same(explicit[n], w)) n += 1;
  }
  return n;
}

/* -------------------------------------------- */
/*  Places an auto-route never goes (0.4.0)     */
/* -------------------------------------------- */

/** Core's WALL_DOOR_TYPES.SECRET. */
export const SECRET_DOOR = 2;
/**
 * Region behaviour types that move a token somewhere else when it walks in (a pentaryn-portals scene
 * link is a teleportToken; core's stairs are changeLevel). An auto-route never enters such a region
 * unless its leg starts or ends inside it.
 */
export const MOVE_ON_ENTER = Object.freeze(["teleportToken", "changeLevel"]);

/**
 * Does the segment p→q cross (or touch) the segment a→b? Collinear overlaps count as touching.
 * The secret-door test: an auto-route never passes a secret door, open or shut.
 */
export function segmentsCross(p, q, a, b) {
  const EPS = 1e-9;
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const on = (u, v, w) => Math.min(u.x, v.x) - EPS <= w.x && w.x <= Math.max(u.x, v.x) + EPS
    && Math.min(u.y, v.y) - EPS <= w.y && w.y <= Math.max(u.y, v.y) + EPS;
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  return (Math.abs(d1) <= EPS && on(a, b, p)) || (Math.abs(d2) <= EPS && on(a, b, q))
    || (Math.abs(d3) <= EPS && on(p, q, a)) || (Math.abs(d4) <= EPS && on(p, q, b));
}

/**
 * Is this region one an auto-route keeps out of? `region`: { hidden, behaviors: [{ type, disabled }] }.
 * A hidden region counts only for a GM (a player's route bending round an invisible trap would give it
 * away; walking into one is the same as a straight drag into it).
 */
export function avoidRegion(region, { isGM = false } = {}) {
  if (!region || (region.hidden && !isGM)) return false;
  return [...(region.behaviors ?? [])].some(b => b && !b.disabled && MOVE_ON_ENTER.includes(b.type));
}
