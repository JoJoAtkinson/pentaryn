/**
 * A synthetic ASCII floor for the pure group planner: '#' is wall, anything else floor. Cell (i, j)
 * is row i, column j; a centre { x, y } in squares lies in cell (floor(y), floor(x)). Gives the
 * oracles group-core's planGroup() asks for, built on the real pathfind-core A* and string pulling,
 * so the routes are the shapes the module itself would find (on a 1-square lattice, cost 1 a step).
 */

import { search, stringPull, directPath } from "../../pathfind-core.mjs";
import { flood } from "../../group-core.mjs";
import { wallOpenFrom } from "../../motion-core.mjs";

/**
 * Does the move p → q meet thin wall w ({ a, b, dir? }, squares)? A crossing or a touch of the wall's line counts (as
 * Foundry 14's lineSegmentIntersection, t within 1e-8), except a one-way wall met from its open side (motion-core
 * wallOpenFrom, Foundry's orientPoint); a move that only starts on the line (leaving it) does not.
 */
export function meetsWall(p, q, w) {
  const o = (u, v, x) => (v.x - u.x) * (x.y - u.y) - (v.y - u.y) * (x.x - u.x);
  const d1 = o(w.a, w.b, p), d2 = o(w.a, w.b, q), d3 = o(p, q, w.a), d4 = o(p, q, w.b);
  const E = 1e-9;
  const on = (u, v, x) => Math.min(u.x, v.x) - E <= x.x && x.x <= Math.max(u.x, v.x) + E && Math.min(u.y, v.y) - E <= x.y && x.y <= Math.max(u.y, v.y) + E;
  let hit = false;
  if (((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E))) hit = true;
  else if (Math.abs(d2) <= E && on(w.a, w.b, q) && Math.abs(d1) > E) hit = true;                 // ends on the line
  else if (Math.abs(d3) <= E && on(p, q, w.a) && Math.abs(d1) > E && Math.abs(d2) > E) hit = true;   // through its end
  else if (Math.abs(d4) <= E && on(p, q, w.b) && Math.abs(d1) > E && Math.abs(d2) > E) hit = true;
  if (!hit) return false;
  if (w.dir && wallOpenFrom([w.a.x, w.a.y, w.b.x, w.b.y], w.dir, p)) return false;
  return true;
}

/**
 * `walls` (optional): thin walls on top of the ASCII rock, [{ a, b, dir? }] in squares (a station of Joe's playground,
 * 0.10 L3): a move whose covered squares' centres cross one is refused, and a token may not rest with a wall through
 * its body (its box inset 0.1 square).
 */
export function gridWorld(ascii, { clock = null, gridLattice = false, pull = true, walls = [] } = {}) {
  const rows = ascii.trim().split("\n").map(r => r.trim());
  const H = rows.length, W = rows[0].length;
  const free = (i, j) => i >= 0 && j >= 0 && i < H && j < W && rows[i][j] !== "#";
  const EPS = 1e-6;
  const calls = { route: 0, avoid: 0 };
  const thin = (walls ?? []).filter(w => w?.a && w?.b);
  /** Does the straight move p → q of a w×h token meet a thin wall (each covered square's centre's own line)? */
  const crossesThin = (p, q, w = 1, h = w) => {
    if (!thin.length) return false;
    for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) {
      const ox = -w / 2 + b + 0.5, oy = -h / 2 + a + 0.5;
      const P = { x: p.x + ox, y: p.y + oy }, Q = { x: q.x + ox, y: q.y + oy };
      if (Math.hypot(Q.x - P.x, Q.y - P.y) < EPS) continue;
      if (thin.some(t => meetsWall(P, Q, t))) return true;
    }
    return false;
  };
  /** One step between neighbouring squares (walls only): rock, a thin wall, a diagonal past a corner of either. */
  const stepOpen = (a, b) => {
    if (!free(b.i, b.j)) return false;
    const c = n => ({ x: n.j + 0.5, y: n.i + 0.5 });
    if (thin.length && thin.some(t => meetsWall(c(a), c(b), t))) return false;
    if (a.i === b.i || a.j === b.j) return true;
    if (!free(a.i, b.j) || !free(b.i, a.j)) return false;
    return !thin.length || (stepOpen(a, { i: a.i, j: b.j }) && stepOpen({ i: a.i, j: b.j }, b) && stepOpen(a, { i: b.i, j: a.j }) && stepOpen({ i: b.i, j: a.j }, b));
  };

  /** Every cell a w×h box at top-left cell (i, j) covers is floor. */
  const fits = (i, j, w = 1, h = w) => {
    for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) if (!free(i + a, j + b)) return false;
    return true;
  };
  /**
   * A point-sampled straight move between two centres: every covered square's centre stays on floor
   * (the adapter casts one wall ray per covered square, core one from the centre).
   */
  const lineFits = (p, q, w = 1, h = w) => {
    if (crossesThin(p, q, w, h)) return false;
    const n = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.05));
    for (let k = 0; k <= n; k++) {
      const x = p.x + (q.x - p.x) * k / n, y = p.y + (q.y - p.y) * k / n;
      for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) {
        if (!free(Math.floor(y - h / 2 + a + 0.5), Math.floor(x - w / 2 + b + 0.5))) return false;
      }
    }
    return true;
  };
  /** At rest: the token's box (inset 0.1 square) is on floor. */
  const walkableAt = (x, y, w = 1, h = w) => {
    const x0 = x - w / 2 + 0.1, x1 = x + w / 2 - 0.1, y0 = y - h / 2 + 0.1, y1 = y + h / 2 - 0.1;
    if (thin.length) {
      const box = [[{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }], [{ x: x1, y: y1 }, { x: x0, y: y1 }], [{ x: x0, y: y1 }, { x: x0, y: y0 }]];
      const inBox = p => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
      for (const t of thin) if (inBox(t.a) || inBox(t.b) || box.some(([u, v]) => meetsWall(u, v, { a: t.a, b: t.b }))) return false;
    }
    for (let i = Math.floor(y0); i <= Math.floor(y1); i++) for (let j = Math.floor(x0); j <= Math.floor(x1); j++) {
      if (!free(i, j)) return false;
    }
    return true;
  };

  const walkable = (m, c) => walkableAt(c.x, c.y, m.w, m.h);

  let floodMap = null, floodFrom = null;
  const walkDistanceFrom = anchor => {
    const o = { i: Math.floor(anchor.y), j: Math.floor(anchor.x) };
    if (!floodFrom || floodFrom.i !== o.i || floodFrom.j !== o.j) {
      floodFrom = o;
      floodMap = flood(o, (a, b) => free(b.i, b.j) && (a.i === b.i || a.j === b.j || (free(a.i, b.j) && free(b.i, a.j))), 20);
    }
    return c => {
      const d = floodMap.get(`${Math.floor(c.y)},${Math.floor(c.x)}`);
      return d === undefined ? null : d;
    };
  };

  /**
   * A* for a w×h member on a 1-square lattice anchored on the destination (as pathfind-adapter's
   * fieldFor anchors it), string-pulled; avoid circles block nodes and steps that come inside them.
   * An off-lattice start joins at its nearest node.
   */
  const route = (m, from, to, { avoid = [] } = {}) => {
    calls.route += 1;
    if (avoid.length) calls.avoid += 1;
    if (clock) clock.t += clock.perRoute ?? 0;
    const w = m.w ?? 1, h = m.h ?? w;
    // gridLattice: as pathfind-adapter's fieldFor, the lattice on whole squares nearest the goal, the goal one hop
    // from its node; else anchored on the goal itself.
    const snapC = (v, n) => (n % 2 === 0 ? Math.round(v) : Math.floor(v) + 0.5);
    const L = gridLattice ? { x: snapC(to.x, w), y: snapC(to.y, h) } : to;
    const centre = n => ({ x: L.x + n.j, y: L.y + n.i });
    const start = { i: Math.round(from.y - L.y), j: Math.round(from.x - L.x) }, goal = { i: Math.round(to.y - L.y), j: Math.round(to.x - L.x) };
    const grazes = (p, q) => avoid.some(a => segDist(p, q, a) < a.r - EPS);
    const blocked = n => !lineFits(centre(n), centre(n), w, h) || avoid.some(a => Math.hypot(centre(n).x - a.x, centre(n).y - a.y) < a.r - EPS);
    const open = (p, q) => lineFits(p, q, w, h) && !grazes(p, q);
    const edge = (a, b) => (blocked(b) || !open(centre(a), centre(b)) ? null : 1);
    const wall = (a, b) => !blocked(b) && lineFits(centre(a), centre(b), w, h);
    if (!walkable(m, to) || !walkable(m, from)) return null;
    const lead = centre(start);
    if (Math.hypot(lead.x - from.x, lead.y - from.y) > EPS && !open(from, lead)) return null;
    const job = search({ start, goal, edge, wall, unit: 1, bounds: { minI: -H - 2, maxI: H + 2, minJ: -W - 2, maxJ: W + 2 } });
    if (job.run() !== "found") return null;
    const lineOk = (a, b) => open(centre(a), centre(b)) && directPath(a, b).every(n => !blocked(n));
    const pulled = pull ? stringPull(job.path, job.costs, { edge, wall, lineOk }) : job.path;
    let pts = [from, ...pulled.map(centre)];
    if (Math.hypot(pts.at(-1).x - to.x, pts.at(-1).y - to.y) > EPS) { if (!open(pts.at(-1), to)) return null; pts.push(to); }
    pts = pts.filter((p, k) => k === 0 || Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) > EPS);
    // The exact start replaces its lattice node where the straight hop past the node is open (not on a fight's
    // lattice, pull: false: there every step is one square, as the module's fight routes are).
    if (pull && pts.length > 2 && open(pts[0], pts[2])) pts.splice(1, 1);
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return { points: pts, length };
  };

  /** Free width across the route (both perpendicular sides), every quarter square; narrow below 4·rmax. */
  const narrow = (points, rmax) => {
    const out = [];
    for (let k = 1; k < points.length; k++) {
      const p = points[k - 1], q = points[k];
      const L = Math.hypot(q.x - p.x, q.y - p.y);
      if (L < EPS) continue;
      const nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L;
      for (let s = 0; s <= L; s += 0.25) {
        const x = p.x + (q.x - p.x) * s / L, y = p.y + (q.y - p.y) * s / L;
        let width = 0;
        for (const side of [1, -1]) {
          let t = 0;
          while (t < 4 * rmax && free(Math.floor(y + side * ny * t), Math.floor(x + side * nx * t))) t += 0.05;
          width += t;
        }
        if (width < 4 * rmax - EPS) out.push({ x, y });
      }
    }
    return out;
  };

  /** A token of radius r at c in a one-wide corridor: from its centre or 0.9 r out, rock within 0.6 on both sides. */
  const cramped = (c, r = 0.5) => [[0, 0], [0.9 * r, 0], [-0.9 * r, 0], [0, 0.9 * r], [0, -0.9 * r]].some(([ox, oy]) => {
    const x = c.x + ox, y = c.y + oy;
    const rock = (dx, dy) => !free(Math.floor(y + dy * 0.6), Math.floor(x + dx * 0.6));
    return (rock(1, 0) && rock(-1, 0)) || (rock(0, 1) && rock(0, -1));
  });

  return { rows, free, walkable, walkDistanceFrom, route, narrow, calls, lineFits, cramped, stepOpen, thin };
}

/** Distance from point c to segment p–q. */
export function segDist(p, q, c) {
  const L2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
  const t = L2 ? Math.min(Math.max(((c.x - p.x) * (q.x - p.x) + (c.y - p.y) * (q.y - p.y)) / L2, 0), 1) : 0;
  return Math.hypot(c.x - (p.x + (q.x - p.x) * t), c.y - (p.y + (q.y - p.y) * t));
}

/** A member record as group.mjs builds it: centre start, same-delta formation, radius from size. */
export function member(id, start, delta, { w = 1, h = w, speed = 6 } = {}) {
  const formation = { x: start.x + delta.x, y: start.y + delta.y };
  return { id, w, h, r: Math.max(w, h) / 2, start, formation, speed, tl: { x: formation.x - w / 2, y: formation.y - h / 2 } };
}

/** Run a planGroup generator to the end (no budget). */
export function finish(gen) {
  for (;;) {
    const s = gen.next();
    if (s.done) return s.value;
  }
}
