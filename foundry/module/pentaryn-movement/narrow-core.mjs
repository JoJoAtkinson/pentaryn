/**
 * Pentaryn Movement — narrow ways, pure (0.10 step N, Joe's R9; plan context/plans/pathfinding-2026-11.md §18.4). No
 * Foundry globals: `node test/run.mjs` imports this bare. Units are squares (a point { x, y }; square (I, J) is row I,
 * column J, x in [J, J + 1), y in [I, I + 1)).
 *
 * Not a feature of its own (no switch, no setting): the pathfinder's finer test, consulted only where the plain square
 * test cannot see. A square is TIGHT when a wall that blocks movement runs through its interior (an off-grid wall: a
 * curved stair, a diagonal slit, a pillar); a map whose walls lie on the grid lines has none, and its routes are found
 * exactly as before.
 *
 *   - Passable: the token's centre keeps NARROW.pass (0.15 square, 9 in) from every wall, for any token up to 1×1, so a
 *     way of 0.3 square or more passes though the token is wider. A bigger token goes only where its body fits (the
 *     plain test; decision 8), never here.
 *   - Cells: every tight square (and each square beside one) is cut into eighth-square cells; a cell is passable when
 *     some point in it keeps the pass radius (its representative point, moved onto the centre line at a throat). Its
 *     square's nodes are the connected groups of its passable cells (components), never the whole square: a square
 *     crossed by two lanes (a hairpin, a thin wall) is two nodes, and no link ever crosses a wall between them.
 *   - The pathfinder's A* stays on squares: `more(node)` gives a node's extra neighbours through tight squares, each
 *     step costing what a square step costs (pathfind-core search's `more`).
 *   - The walk (`walkFor`): through tight squares the eighth-cell path of least length × a penalty for clearance under
 *     the padding radius (the token's own radius, wanted, not required), then a band settled on it: smoothed, pushed
 *     out to the padding radius where there is room and onto the centre line where the way is narrower than the
 *     token; simplified to chords that keep both. Every sample of it every 1/16 square keeps the pass radius. Sent as
 *     one move, so it animates as one motion.
 *
 * The field is cached by its caller (pathfind.mjs) until a wall or door changes; everything in it is built lazily, a
 * square at a time, where a search touches.
 */


export const NARROW = Object.freeze({
  fine: 8,              // cells per square side (eighth squares)
  pass: 0.15,           // squares: the centre's clearance from every wall, any token up to 1×1 (a way of 0.3 passes)
  eps: 1e-3,            // squares: numerical tolerance on the clearance (0.1 px on a 100 px grid)
  reach: 1,             // squares: walls farther than this from a point are not looked at
  penalty: 3,           // the fine path's cost per length: 1 + penalty × (padding missing) / padding
  spacing: 0.125,       // squares between the band's points while it settles
  iterations: 60,       // band iterations
  lambda: 0.5,          // band smoothing step
  maxStep: 0.1,         // squares: the most a band point moves in one iteration
  settled: 2e-4,        // squares: the band is settled when no point moved farther in an iteration
  tol: 0.012,           // squares: the walked chords keep this close to the settled band
  tube: 0.025,          // squares: where the way is narrower than the token the band keeps this close to its centre line
  turn: 15,             // degrees: a chord corner turning more is cut (twice at most), each cut at most `cut` along a leg
  cut: 0.05,            // squares
  sample: 1 / 16,       // squares: the walk is checked every this far
  maxChord: 2,          // squares: the longest chord
  opposing: -0.3,       // two walls face each other across a way when their normals' dot is below this
  maxCells: 4000,       // cells one fine search settles at most
});

const EPS = 1e-9;
const N8 = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
const sqKey = (I, J) => `${I},${J}`;

/* -------------------------------------------- */
/*  Geometry                                    */
/* -------------------------------------------- */

/** Distance from (px, py) to segment a-b, the nearest point into `out` ({ d, x, y }). */
function segNear(px, py, ax, ay, bx, by, out) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > EPS ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t, y = ay + dy * t;
  out.x = x; out.y = y; out.d = Math.hypot(px - x, py - y);
  return out;
}

/** Does segment p-q meet the open box (x0, y0)-(x1, y1) along a stretch of positive length (Liang-Barsky)? */
function segThroughBox(ax, ay, bx, by, x0, y0, x1, y1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p, q) => {
    if (Math.abs(p) < EPS) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, ax - x0) || !clip(dx, x1 - ax) || !clip(-dy, ay - y0) || !clip(dy, y1 - ay)) return false;
  return (t1 - t0) * Math.hypot(dx, dy) > 1e-7;
}

/** Foundry's orientation test for a one-way wall (motion-core wallOpenFrom, any units). */
function openFrom(c, dir, p) {
  const d = Number(dir);
  if (!(d === 1 || d === 2)) return false;
  const o = (c[1] - p.y) * (c[2] - p.x) - (c[0] - p.x) * (c[3] - p.y);
  if (Math.abs(o) < 1e-12) return false;
  return (o < 0 ? 1 : 2) === d;
}

/** Points along a polyline every `step` (its first and last kept). */
export function resample(pts, step) {
  if (pts.length < 2) return pts.map(p => ({ x: p.x, y: p.y }));
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t < L - 1e-9) {
      out.push({ x: a.x + (b.x - a.x) * (t / L), y: a.y + (b.y - a.y) * (t / L) });
      t += step;
    }
    carry = L - (t - step);
  }
  const last = pts.at(-1);
  if (Math.hypot(out.at(-1).x - last.x, out.at(-1).y - last.y) > step * 0.35) out.push({ x: last.x, y: last.y });
  else out[out.length - 1] = { x: last.x, y: last.y };
  return out;
}

/* -------------------------------------------- */
/*  The field                                   */
/* -------------------------------------------- */

/**
 * A narrow-way field over a scene's walls.
 * @param {number[][]} walls   [[ax, ay, bx, by], …] squares: walls that block movement both ways (closed doors, secret
 *                             doors, walls the player has seen in a preview)
 * @param {object} [o]
 * @param {{c: number[], dir: number}[]} [o.lines]  one-way walls (squares): crossed only from their open side; they
 *                             cost no clearance
 * @param {number} [o.pad]      the padding radius (squares): the token's own
 * @param {number} [o.pass]
 */
export function narrowField(walls, { lines = [], pad = 0.5, pass = NARROW.pass } = {}) {
  const W = Float64Array.from((walls ?? []).flatMap(w => [w[0], w[1], w[2], w[3]]));
  const nW = W.length / 4;
  const Ls = (lines ?? []).filter(l => Array.isArray(l?.c) && l.c.length >= 4);
  const R = NARROW.reach;
  const CH = 8;                                       // a chunk is 8×8 squares
  const chunks = new Map();
  const addChunk = (key, k) => { let a = chunks.get(key); if (!a) chunks.set(key, (a = [])); a.push(k); };
  const chunkSpan = (x0, y0, x1, y1, fn) => {
    for (let ci = Math.floor((y0 - R - 1) / CH); ci <= Math.floor((y1 + R + 1) / CH); ci++)
      for (let cj = Math.floor((x0 - R - 1) / CH); cj <= Math.floor((x1 + R + 1) / CH); cj++) fn(`${ci},${cj}`);
  };
  for (let k = 0; k < nW; k++) {
    const ax = W[4 * k], ay = W[4 * k + 1], bx = W[4 * k + 2], by = W[4 * k + 3];
    chunkSpan(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), key => addChunk(key, k));
  }
  const lineChunks = new Map();
  Ls.forEach((l, k) => {
    const [ax, ay, bx, by] = l.c;
    chunkSpan(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), key => {
      let a = lineChunks.get(key); if (!a) lineChunks.set(key, (a = [])); a.push(k);
    });
  });
  const scratch = { d: 0, x: 0, y: 0 };
  const passMin = pass - NARROW.eps;
  /** The walls within reach of square (I, J) (from its centre: reach + half its diagonal). */
  const buckets = new Map();
  // A number key (0.10.2: the band asks for a bucket on every clearance; the string key was a measurable part of it).
  const bucket = (I, J) => {
    const key = (I + 32768) * 65536 + (J + 32768);
    let b = buckets.get(key);
    if (b) return b;
    const list = chunks.get(`${Math.floor(I / CH)},${Math.floor(J / CH)}`) ?? [];
    const cx = J + 0.5, cy = I + 0.5, lim = R + 0.7072;
    b = [];
    for (const k of list) if (segNear(cx, cy, W[4 * k], W[4 * k + 1], W[4 * k + 2], W[4 * k + 3], scratch).d <= lim) b.push(k);
    b = Int32Array.from(b);
    buckets.set(key, b);
    return b;
  };
  const lineBucket = (I, J) => lineChunks.get(`${Math.floor(I / CH)},${Math.floor(J / CH)}`) ?? [];

  /** Clearance at (x, y): the distance to the nearest wall, at most reach. */
  const clearance = (x, y) => {
    const b = bucket(Math.floor(y), Math.floor(x));
    let d = R;
    for (let n = 0; n < b.length; n++) {
      const k = b[n];
      const e = segNear(x, y, W[4 * k], W[4 * k + 1], W[4 * k + 2], W[4 * k + 3], scratch).d;
      if (e < d) d = e;
    }
    return d;
  };
  /** The nearest wall point to (x, y), and the nearest one facing it across the way (or null). */
  const near = { d: 0, x: 0, y: 0, k: -1 };
  const opp = { d: 0, x: 0, y: 0, k: -1 };
  // Each wall's nearest point from the first pass, read again by the second (0.10.2: one segNear per wall, not two).
  let ND = new Float64Array(64), NX = new Float64Array(64), NY = new Float64Array(64);
  const nearest = (x, y) => {
    const b = bucket(Math.floor(y), Math.floor(x));
    if (b.length > ND.length) { ND = new Float64Array(2 * b.length); NX = new Float64Array(2 * b.length); NY = new Float64Array(2 * b.length); }
    near.d = R; near.k = -1;
    for (let n = 0; n < b.length; n++) {
      const k = b[n];
      segNear(x, y, W[4 * k], W[4 * k + 1], W[4 * k + 2], W[4 * k + 3], scratch);
      ND[n] = scratch.d; NX[n] = scratch.x; NY[n] = scratch.y;
      if (scratch.d < near.d) { near.d = scratch.d; near.x = scratch.x; near.y = scratch.y; near.k = k; }
    }
    if (near.k < 0 || near.d < EPS) { opp.k = -1; return; }
    const ux = (x - near.x) / near.d, uy = (y - near.y) / near.d;
    opp.d = R; opp.k = -1;
    for (let n = 0; n < b.length; n++) {
      const k = b[n];
      if (k === near.k) continue;
      const d = ND[n];
      if (d >= opp.d || d < EPS) continue;
      const vx = (x - NX[n]) / d, vy = (y - NY[n]) / d;
      if (ux * vx + uy * vy > NARROW.opposing) continue;
      opp.d = d; opp.x = NX[n]; opp.y = NY[n]; opp.k = k;
    }
  };

  /** Does segment p-q cross (or touch) segment a-b? Numbers only (the band asks this thousands of times). */
  const hits = (px, py, qx, qy, ax, ay, bx, by) => {
    const E = 1e-9;
    const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const d2 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
    const d3 = (qx - px) * (ay - py) - (qy - py) * (ax - px);
    const d4 = (qx - px) * (by - py) - (qy - py) * (bx - px);
    if (((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E))) return true;
    const on = (ux, uy, vx, vy, wx, wy) => Math.min(ux, vx) - E <= wx && wx <= Math.max(ux, vx) + E && Math.min(uy, vy) - E <= wy && wy <= Math.max(uy, vy) + E;
    return (Math.abs(d1) <= E && on(ax, ay, bx, by, px, py)) || (Math.abs(d2) <= E && on(ax, ay, bx, by, qx, qy))
      || (Math.abs(d3) <= E && on(px, py, qx, qy, ax, ay)) || (Math.abs(d4) <= E && on(px, py, qx, qy, bx, by));
  };
  const mark = new Int32Array(Math.max(nW, 1));
  let epoch = 0;
  /** Does the straight move p → q cross a wall, or a one-way wall from its shut side? */
  const crosses = (p, q) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    epoch += 1;
    // A move up to half a square long is seen whole from its midpoint's square (its bucket reaches 1.7 squares).
    const n = L <= 0.5 ? 0 : Math.ceil(L / 0.5);
    for (let s = 0; s <= n; s++) {
      const t = n ? s / n : 0.5;
      const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
      const I = Math.floor(y), J = Math.floor(x);
      const b = bucket(I, J);
      for (let m = 0; m < b.length; m++) {
        const k = b[m];
        if (mark[k] === epoch) continue;
        mark[k] = epoch;
        if (hits(p.x, p.y, q.x, q.y, W[4 * k], W[4 * k + 1], W[4 * k + 2], W[4 * k + 3])) return true;
      }
      if (Ls.length) for (const k of lineBucket(I, J)) {
        const l = Ls[k];
        if (!hits(p.x, p.y, q.x, q.y, l.c[0], l.c[1], l.c[2], l.c[3])) continue;
        if (!openFrom(l.c, l.dir, p)) return true;
      }
    }
    return false;
  };

  /** Does p → q cross a one-way wall from its shut side? */
  const lineCross = (p, q) => {
    if (!Ls.length) return false;
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    const n = L <= 0.5 ? 0 : Math.ceil(L / 0.5);
    for (let s = 0; s <= n; s++) {
      const t = n ? s / n : 0.5;
      for (const k of lineBucket(Math.floor(p.y + (q.y - p.y) * t), Math.floor(p.x + (q.x - p.x) * t))) {
        const l = Ls[k];
        if (hits(p.x, p.y, q.x, q.y, l.c[0], l.c[1], l.c[2], l.c[3]) && !openFrom(l.c, l.dir, p)) return true;
      }
    }
    return false;
  };
  /**
   * Is the straight move a → b walkable, its ends' clearances da, db known: no wall crossed, and (both ends keeping
   * the pass radius) every sample every NARROW.sample keeps it. Clearance changes by at most the distance moved, so a
   * move whose ends together keep more than its length crosses no wall, and one whose ends keep enough needs no
   * samples; samples closer than twice the radius that all keep it leave no room for a crossing either.
   */
  const segOk = (a, da, b, db) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (lineCross(a, b)) return false;
    if (da >= passMin && db >= passMin) {
      if ((da + db - L) / 2 >= passMin) return true;
      const n = Math.max(1, Math.ceil(L / NARROW.sample));
      for (let s = 1; s < n; s++) if (clearance(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n) < passMin) return false;
      return true;
    }
    if (da + db > L + 1e-9) return true;
    return !crosses(a, b);
  };

  /** Move (x, y) onto the centre line between the nearest wall and the one facing it (Newton on the two distances). */
  const medial = (x, y, box = null) => {
    let px = x, py = y;
    for (let it = 0; it < 6; it++) {
      nearest(px, py);
      if (near.k < 0 || opp.k < 0) break;
      const u1x = (px - near.x) / near.d, u1y = (py - near.y) / near.d;
      const u2x = (px - opp.x) / opp.d, u2y = (py - opp.y) / opp.d;
      let vx = u1x - u2x, vy = u1y - u2y;
      const L = Math.hypot(vx, vy);
      if (L < EPS) break;
      vx /= L; vy /= L;
      const a = (1 - (u1x * u2x + u1y * u2y)) / L;
      let t = (opp.d - near.d) / (2 * a);
      if (t > NARROW.maxStep) t = NARROW.maxStep; else if (t < -NARROW.maxStep) t = -NARROW.maxStep;
      px += vx * t; py += vy * t;
      if (box) { px = Math.min(Math.max(px, box[0]), box[2]); py = Math.min(Math.max(py, box[1]), box[3]); }
      if (Math.abs(t) < 1e-6) break;
    }
    return { x: px, y: py };
  };

  /**
   * Where a point settles (the band's push): onto the centre line where the way is narrower than 2 × pad (the
   * token), else out from the nearest wall to the padding radius (never past the centre line). Same point when open.
   */
  const settle = (x, y, tube = 0) => {
    let px = x, py = y;
    for (let it = 0; it < 3; it++) {
      nearest(px, py);
      if (near.k < 0 || near.d >= pad - 1e-6) break;
      if (opp.k >= 0 && near.d + opp.d < 2 * pad + 1e-6) {
        const m = medial(px, py);
        if (!(tube > 0)) return m;
        // Within `tube` of the centre line the band may stay (it smooths a kink there), never under the pass radius.
        const half = clearance(m.x, m.y);
        const t = Math.min(tube, Math.max(0, half - passMin - 0.002));
        const dx = px - m.x, dy = py - m.y, L = Math.hypot(dx, dy);
        return L <= t ? { x: px, y: py } : { x: m.x + (dx * t) / L, y: m.y + (dy * t) / L };
      }
      const ux = (px - near.x) / near.d, uy = (py - near.y) / near.d;
      let t = pad - near.d;
      if (opp.k >= 0) t = Math.min(t, (opp.d - near.d) / 2);
      if (t <= 1e-6) break;
      px += ux * t; py += uy * t;
    }
    return { x: px, y: py };
  };

  /** How wide the way is at (x, y): the nearest wall plus the one facing it (Infinity: no wall faces it). */
  const widthAt = (x, y) => {
    nearest(x, y);
    if (near.k < 0 || opp.k < 0) return Infinity;
    return near.d + opp.d;
  };

  /* Tight squares and their cells. */
  const tightMemo = new Map();
  const tight = (I, J) => {
    const key = sqKey(I, J);
    let t = tightMemo.get(key);
    if (t !== undefined) return t;
    t = false;
    const b = bucket(I, J);
    const d = 1e-7;
    for (let n = 0; n < b.length && !t; n++) {
      const k = b[n];
      if (segThroughBox(W[4 * k], W[4 * k + 1], W[4 * k + 2], W[4 * k + 3], J + d, I + d, J + 1 - d, I + 1 - d)) t = true;
    }
    tightMemo.set(key, t);
    return t;
  };

  const F = NARROW.fine, h = 1 / (2 * F);
  /**
   * Can the straight link p → q be walked: no wall crossed, and every sample of it every NARROW.sample keeps the pass
   * radius, as the walk's own check samples it (so a path of cells is always a walk that passes; R9). The ends are
   * the caller's (cell points keep it by construction).
   */
  const linkOk = (px, py, qx, qy) => {
    const a = { x: px, y: py }, b = { x: qx, y: qy };
    const da = clearance(px, py), db = clearance(qx, qy);
    // A link's own ends may lie under the radius (a token's start squeezed there): then only no wall crossed.
    return segOk(a, da, b, db);
  };
  /** linkOk between two cells by their global cell offsets (u = 8J + a, v = 8I + b), cached both ways. */
  const linkMemo = new Map();
  const cellLink = (u1, v1, x1, y1, u2, v2, x2, y2) => {
    const k1 = (u1 + 1e6) * 4e6 + (v1 + 1e6), k2 = (u2 + 1e6) * 4e6 + (v2 + 1e6);
    const key = k1 < k2 ? `${k1}>${k2}` : `${k2}>${k1}`;
    let ok = linkMemo.get(key);
    if (ok === undefined) { ok = linkOk(x1, y1, x2, y2); linkMemo.set(key, ok); }
    return ok;
  };
  const cellMemo = new Map();
  /** Square (I, J)'s cells: rep points (x, y), clearance (d), component (comp: −1 blocked, 1… its node). */
  const cells = (I, J) => {
    const key = sqKey(I, J);
    let c = cellMemo.get(key);
    if (c) return c;
    const n = F * F;
    c = { x: new Float64Array(n), y: new Float64Array(n), d: new Float64Array(n), comp: new Int8Array(n).fill(-1), n: 0, centre: 0 };
    for (let b = 0; b < F; b++) for (let a = 0; a < F; a++) {
      const k = b * F + a;
      let x = J + (a + 0.5) / F, y = I + (b + 0.5) / F;
      let d = clearance(x, y);
      if (d < passMin && d >= passMin - Math.SQRT2 * h) {
        // A border cell: the best point in it (a few samples, then onto the centre line inside the cell).
        const box = [x - h, y - h, x + h, y + h];
        let bx = x, by = y, bd = d;
        for (let sb = -2; sb <= 2; sb++) for (let sa = -2; sa <= 2; sa++) {
          if (!sa && !sb) continue;
          const qx = x + (sa * h) / 2.5, qy = y + (sb * h) / 2.5;
          const qd = clearance(qx, qy);
          if (qd > bd) { bd = qd; bx = qx; by = qy; }
        }
        const m = medial(bx, by, box);
        const md = clearance(m.x, m.y);
        if (md > bd) { bd = md; bx = m.x; by = m.y; }
        x = bx; y = by; d = bd;
      }
      c.x[k] = x; c.y[k] = y; c.d[k] = d;
      c.comp[k] = d >= passMin ? 0 : -1;
    }
    // Components: 8-neighbour cells joined by a walkable link.
    let comps = 0;
    for (let k0 = 0; k0 < n; k0++) {
      if (c.comp[k0] !== 0) continue;
      comps += 1;
      c.comp[k0] = comps;
      const stack = [k0];
      while (stack.length) {
        const k = stack.pop();
        const a = k % F, b = (k - a) / F;
        for (const [db, da] of N8) {
          const a2 = a + da, b2 = b + db;
          if (a2 < 0 || b2 < 0 || a2 >= F || b2 >= F) continue;
          const k2 = b2 * F + a2;
          if (c.comp[k2] !== 0) continue;
          if (!cellLink(F * J + a, F * I + b, c.x[k], c.y[k], F * J + a2, F * I + b2, c.x[k2], c.y[k2])) continue;
          c.comp[k2] = comps;
          stack.push(k2);
        }
      }
    }
    c.n = comps;
    // The component the square's centre lies in (0: none): its node and the plain node are the same place.
    const cx = J + 0.5, cy = I + 0.5;
    if (clearance(cx, cy) >= passMin) {
      for (const k of [(F / 2 - 1) * F + F / 2 - 1, (F / 2 - 1) * F + F / 2, (F / 2) * F + F / 2 - 1, (F / 2) * F + F / 2]) {
        if (c.comp[k] > 0 && linkOk(cx, cy, c.x[k], c.y[k])) { c.centre = c.comp[k]; break; }
      }
    }
    cellMemo.set(key, c);
    return c;
  };
  /** The node a cell of square (I, J) belongs to: its component in a tight square, the square itself (0) otherwise. */
  const nodeOfCell = (I, J, k) => {
    const c = cells(I, J);
    if (c.comp[k] <= 0) return -1;
    return tight(I, J) ? c.comp[k] : 0;
  };

  /** Pairs [cA, cB] of nodes of square A = (I, J) and of its neighbour B = (I + di, J + dj) joined by a cell link. */
  const adjMemo = new Map();
  const adjacent = (I, J, di, dj) => {
    const key = `${I},${J}>${di},${dj}`;
    let pairs = adjMemo.get(key);
    if (pairs) return pairs;
    const I2 = I + di, J2 = J + dj;
    const A = cells(I, J), B = cells(I2, J2);
    const found = new Set();
    pairs = [];
    const edge = (di0, dj0) => {
      // Cells of A on the side facing B, and of B on the side facing A.
      const listA = [], listB = [];
      for (let b = 0; b < F; b++) for (let a = 0; a < F; a++) {
        const onA = (dj0 > 0 ? a === F - 1 : dj0 < 0 ? a === 0 : true) && (di0 > 0 ? b === F - 1 : di0 < 0 ? b === 0 : true);
        const onB = (dj0 > 0 ? a === 0 : dj0 < 0 ? a === F - 1 : true) && (di0 > 0 ? b === 0 : di0 < 0 ? b === F - 1 : true);
        if (onA) listA.push(b * F + a);
        if (onB) listB.push(b * F + a);
      }
      return [listA, listB];
    };
    const [la, lb] = edge(di, dj);
    for (const ka of la) {
      const na = nodeOfCell(I, J, ka);
      if (na < 0) continue;
      const aa = ka % F, ba = (ka - aa) / F;
      for (const kb of lb) {
        const nb = nodeOfCell(I2, J2, kb);
        if (nb < 0) continue;
        const ab = kb % F, bb = (kb - ab) / F;
        // Fine neighbours across the boundary: their global cell offsets differ by at most one.
        const gu = (J2 - J) * F + ab - aa, gv = (I2 - I) * F + bb - ba;
        if (Math.abs(gu) > 1 || Math.abs(gv) > 1) continue;
        const pk = `${na},${nb}`;
        if (found.has(pk)) continue;
        if (!cellLink(F * J + aa, F * I + ba, A.x[ka], A.y[ka], F * J2 + ab, F * I2 + bb, B.x[kb], B.y[kb])) continue;
        found.add(pk);
        pairs.push([na, nb]);
      }
    }
    adjMemo.set(key, pairs);
    return pairs;
  };

  /**
   * The extra A* neighbours of node n ({ I, J, c }, absolute squares; c 0 the plain square, c ≥ 1 a component of a
   * tight square): [{ I, J, c, zero }] (zero: the plain node and its own centre's component, no step).
   */
  const more = n => {
    const out = [];
    const T = tight(n.I, n.J);
    if (n.c === 0 && T) {
      const cc = cells(n.I, n.J).centre;
      if (cc > 0) out.push({ I: n.I, J: n.J, c: cc, zero: true });
      return out;
    }
    if (n.c > 0 && cells(n.I, n.J).centre === n.c) out.push({ I: n.I, J: n.J, c: 0, zero: true });
    for (const [di, dj] of N8) {
      const I2 = n.I + di, J2 = n.J + dj;
      const T2 = tight(I2, J2);
      if (!T && !T2) continue;                          // plain to plain: the plain test's alone
      for (const [ca, cb] of adjacent(n.I, n.J, di, dj)) if (ca === n.c) out.push({ I: I2, J: J2, c: cb, zero: false });
    }
    return out;
  };

  /** A point's node: the component its nearest linked passable cell belongs to, or null. */
  const nodeAt = p => {
    const I = Math.floor(p.y), J = Math.floor(p.x);
    const c = cells(I, J);
    let best = -1, bd = Infinity;
    for (let k = 0; k < F * F; k++) {
      if (c.comp[k] <= 0) continue;
      const d = Math.hypot(c.x[k] - p.x, c.y[k] - p.y);
      if (d < bd && linkOk(p.x, p.y, c.x[k], c.y[k])) { bd = d; best = k; }
    }
    if (best < 0) return null;
    return { I, J, c: tight(I, J) ? c.comp[best] : 0 };
  };

  /**
   * The nearest point to p a token may rest on in a narrow way: onto the centre line where the way there is narrower
   * than the token, else out to the padding radius; p itself when it already keeps it. null when nowhere near is
   * passable (within half a square).
   */
  const restPoint = p => {
    let q = { x: p.x, y: p.y };
    if (clearance(q.x, q.y) < passMin) {
      // In the rock or against a wall: the nearest passable cell's point first.
      let best = null, bd = 0.75;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const I = Math.floor(p.y) + di, J = Math.floor(p.x) + dj;
        const c = cells(I, J);
        for (let k = 0; k < F * F; k++) {
          if (c.comp[k] <= 0) continue;
          const d = Math.hypot(c.x[k] - p.x, c.y[k] - p.y);
          if (d < bd) { bd = d; best = { x: c.x[k], y: c.y[k] }; }
        }
      }
      if (!best) return null;
      q = best;
    }
    const s = settle(q.x, q.y);
    return clearance(s.x, s.y) >= passMin && !crosses(q, s) ? s : q;
  };

  return {
    pad, pass, walls: nW, clearance, crosses, medial, settle, widthAt, tight, cells, more, nodeAt, adjacent, restPoint,
    linkOk, cellLink, segOk, lineCross, passMin,
    /** The squares built so far (cold-build report). */
    built: () => ({ squares: cellMemo.size, tight: [...tightMemo.values()].filter(Boolean).length, pairs: adjMemo.size }),
  };
}

/* -------------------------------------------- */
/*  The fine path through a run of nodes        */
/* -------------------------------------------- */

/**
 * The eighth-cell path from `from` to `to` through the cells of `nodes` ([{ I, J, c }]: a component of a tight square,
 * or c 0: a plain square, all its passable cells; in a tight square, its centre's component), of least length × the
 * padding penalty. [from, …cell points, to] or null.
 */
export function finePath(field, nodes, from, to) {
  const F = NARROW.fine;
  const allow = new Map();                           // square key → Set of components (−1: every passable cell)
  for (const n of nodes) {
    const key = sqKey(n.I, n.J);
    let set = allow.get(key);
    if (!set) allow.set(key, (set = new Set()));
    // A plain node of a tight square whose centre is in no part (a plain step's centre hugging a wall): any of its
    // parts (the links between cells still never cross a wall).
    const centre = n.c > 0 ? n.c : field.tight(n.I, n.J) ? field.cells(n.I, n.J).centre : -1;
    set.add(centre > 0 ? centre : -1);
  }
  const ok = (I, J, k) => {
    const set = allow.get(sqKey(I, J));
    if (!set) return false;
    const comp = field.cells(I, J).comp[k];
    if (comp <= 0) return false;
    return set.has(-1) || set.has(comp);
  };
  const id = (I, J, k) => `${I},${J},${k}`;
  const pt = (I, J, k) => { const c = field.cells(I, J); return { x: c.x[k], y: c.y[k], d: c.d[k] }; };
  const pad = field.pad;
  const weight = (d1, d2) => 1 + NARROW.penalty * Math.max(0, pad - Math.min(d1, d2)) / Math.max(pad, EPS);
  // Start and goal cells: the passable cells of their own square (and its neighbours in the run) a link reaches.
  const ends = p => {
    const out = [];
    const I0 = Math.floor(p.y), J0 = Math.floor(p.x);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const I = I0 + di, J = J0 + dj;
      if (!allow.has(sqKey(I, J))) continue;
      const c = field.cells(I, J);
      for (let k = 0; k < F * F; k++) {
        if (!ok(I, J, k)) continue;
        const d = Math.hypot(c.x[k] - p.x, c.y[k] - p.y);
        if (d > 0.3) continue;
        out.push({ I, J, k, d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out.filter(e => field.linkOk(p.x, p.y, pt(e.I, e.J, e.k).x, pt(e.I, e.J, e.k).y)).slice(0, 6);
  };
  const starts = ends(from), goals = ends(to);
  if (!starts.length || !goals.length) return null;
  const goalSet = new Map(goals.map(g => [id(g.I, g.J, g.k), g]));
  const dFrom = field.clearance(from.x, from.y), dTo = field.clearance(to.x, to.y);
  const recs = new Map();
  const heap = [];
  const push = r => {
    heap.push(r);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const hTo = (x, y) => Math.hypot(to.x - x, to.y - y);
  for (const s of starts) {
    const p = pt(s.I, s.J, s.k);
    const g = s.d * weight(dFrom, p.d);
    const key = id(s.I, s.J, s.k);
    const r = { I: s.I, J: s.J, k: s.k, g, parent: null, closed: false };
    recs.set(key, r);
    push({ r, f: g + hTo(p.x, p.y) });
  }
  let settled = 0, end = null;
  while (heap.length) {
    const { r } = pop();
    if (r.closed) continue;
    r.closed = true;
    if (++settled > NARROW.maxCells) break;
    const key = id(r.I, r.J, r.k);
    const here = pt(r.I, r.J, r.k);
    if (goalSet.has(key)) {
      const gg = goalSet.get(key);
      const total = r.g + gg.d * weight(here.d, dTo);
      if (!end || total < end.total) end = { r, total };
      // The first goal popped is the best up to the last link's length (≤ 0.3): settle.
      break;
    }
    const a = r.k % F, b = (r.k - a) / F;
    for (const [db, da] of N8) {
      let a2 = a + da, b2 = b + db, I2 = r.I, J2 = r.J;
      if (a2 < 0) { a2 += F; J2 -= 1; } else if (a2 >= F) { a2 -= F; J2 += 1; }
      if (b2 < 0) { b2 += F; I2 -= 1; } else if (b2 >= F) { b2 -= F; I2 += 1; }
      const k2 = b2 * F + a2;
      if (!ok(I2, J2, k2)) continue;
      const key2 = id(I2, J2, k2);
      const old = recs.get(key2);
      if (old?.closed) continue;
      const q = pt(I2, J2, k2);
      if (!field.cellLink(F * r.J + a, F * r.I + b, here.x, here.y, F * J2 + a2, F * I2 + b2, q.x, q.y)) continue;
      const g = r.g + Math.hypot(q.x - here.x, q.y - here.y) * weight(here.d, q.d);
      if (old && old.g <= g + EPS) continue;
      const rec = old ?? { I: I2, J: J2, k: k2, closed: false };
      rec.g = g; rec.parent = r;
      recs.set(key2, rec);
      push({ r: rec, f: g + hTo(q.x, q.y) });
    }
  }
  if (!end) return null;
  const out = [];
  for (let r = end.r; r; r = r.parent) { const p = pt(r.I, r.J, r.k); out.push({ x: p.x, y: p.y }); }
  out.reverse();
  return [{ x: from.x, y: from.y }, ...out, { x: to.x, y: to.y }];
}

/* -------------------------------------------- */
/*  The band                                    */
/* -------------------------------------------- */

/**
 * Settle a polyline (squares, its ends fixed) into the walked band: points every NARROW.spacing, each moved toward its
 * neighbours' midpoint (smoothing, shortening), then settled (onto the centre line where the way is narrower than the
 * token, else out to the padding radius); a move that would cross a wall, lose the pass radius, or that `okSeg`
 * refuses is not made. Returns the new points.
 */
export function relax(field, pts, o = {}) { return drain(relaxSteps(field, pts, o)); }

/** Run a generator to its end, every yield ignored (the synchronous form of a cooperative step). */
export function drain(gen) {
  for (;;) { const r = gen.next(); if (r.done) return r.value; }
}

/** relax, yielding after each iteration (0.10.2: a long band is a page's longest task; the plan slices it). */
export function* relaxSteps(field, pts, { okSeg = () => true, iterations = NARROW.iterations } = {}) {
  let P = resample(pts, NARROW.spacing);
  if (P.length < 3) return P;
  const pm = field.passMin;
  let D = P.map(p => field.clearance(p.x, p.y));      // each point's clearance, kept as it moves
  let most = 0;                                       // the largest move of this iteration
  // A point's step depends only on it and its two neighbours (and their clearances, kept with them): one whose last
  // step moved nothing, none of the three moved since, would move nothing again, and is skipped (0.10.2: most of a
  // long band settles early while a few points still move; the same band, a fraction of the work).
  let tick = 0;
  let changedAt = new Int32Array(P.length).fill(1), idleAt = new Int32Array(P.length);
  tick = 1;
  const tryMove = (k, q) => {
    const p = P[k];
    let dx = q.x - p.x, dy = q.y - p.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-7) return false;
    if (L > NARROW.maxStep) { dx *= NARROW.maxStep / L; dy *= NARROW.maxStep / L; }
    const r = { x: p.x + dx, y: p.y + dy };
    const dr = field.clearance(r.x, r.y);
    if (dr < pm && dr <= D[k]) return false;
    // A segment with an end under the pass radius (a plain stretch hugging a wall, still being pushed out): no wall
    // crossed; else it keeps the radius all along (segOk).
    if (!field.segOk(P[k - 1], D[k - 1], r, dr) || !field.segOk(r, dr, P[k + 1], D[k + 1])) return false;
    if (!okSeg(P[k - 1], r) || !okSeg(r, P[k + 1])) return false;
    P[k] = r;
    D[k] = dr;
    changedAt[k] = ++tick;
    if (L > most) most = Math.min(L, NARROW.maxStep);
    return true;
  };
  // First every point settled where it is (onto the centre line in a narrow way): the iterations then only smooth.
  for (let k = 1; k < P.length - 1; k++) {
    const q = field.settle(P[k].x, P[k].y);
    if (Math.hypot(q.x - P[k].x, q.y - P[k].y) > 1e-7) tryMove(k, q);
  }
  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    most = 0;
    for (let k = 1; k < P.length - 1; k++) {
      const idle = idleAt[k];
      if (idle && idle > changedAt[k - 1] && idle > changedAt[k] && idle > changedAt[k + 1]) continue;
      const before = changedAt[k];
      const a = P[k - 1], b = P[k + 1], p = P[k];
      const m = { x: p.x + NARROW.lambda * ((a.x + b.x) / 2 - p.x), y: p.y + NARROW.lambda * ((a.y + b.y) / 2 - p.y) };
      const q = field.settle(m.x, m.y, NARROW.tube);
      if (tryMove(k, q)) moved += 1;
      else {
        // The smoothing step refused (a wall end in the way, a neighbour at a narrower spot): settle where it is, in
        // the tube, else exactly on the centre line.
        const q2 = field.settle(p.x, p.y, NARROW.tube);
        if (!(Math.hypot(q2.x - p.x, q2.y - p.y) > 1e-6 && tryMove(k, q2))) {
          const q3 = field.settle(p.x, p.y);
          if (Math.hypot(q3.x - p.x, q3.y - p.y) > 1e-6) tryMove(k, q3);
        }
      }
      idleAt[k] = changedAt[k] === before ? ++tick : 0;
    }
    if ((it + 1) % 10 === 0 && it + 1 < iterations) {
      const R = resample(P, NARROW.spacing);
      const DR = R.map(p => field.clearance(p.x, p.y));
      // A resampled chord may not cut a corner the band went round.
      let ok = R.length >= 2;
      for (let k = 1; ok && k < R.length; k++) if (!field.segOk(R[k - 1], DR[k - 1], R[k], DR[k]) && field.crosses(R[k - 1], R[k])) ok = false;
      if (ok) { P = R; D = DR; changedAt = new Int32Array(P.length).fill(++tick); idleAt = new Int32Array(P.length); }
    }
    if (!moved || most < NARROW.settled) break;
    yield;
  }
  // Last: every point settled once more (the narrow parts within the tube of the centre line).
  for (let k = 1; k < P.length - 1; k++) {
    const q = field.settle(P[k].x, P[k].y, NARROW.tube);
    if (Math.hypot(q.x - P[k].x, q.y - P[k].y) > 1e-7 && tryMove(k, q)) continue;
    const q2 = field.settle(P[k].x, P[k].y);
    if (Math.hypot(q2.x - P[k].x, q2.y - P[k].y) > 1e-7) tryMove(k, q2);
  }
  return P;
}

/**
 * The walked polyline's checks: its samples every NARROW.sample keep the pass radius (and so cross no wall), every
 * segment is walkable (`okSeg`, no one-way wall from its shut side). { ok, minClearance, narrow } (narrow: some sample
 * lies where the way is narrower than 2 × pad).
 */
export function checkWalk(field, pts, { okSeg = () => true, ends = false } = {}) {
  let min = Infinity, narrow = false, ok = true;
  const last = pts.length - 1;
  // `ends`: a start or goal the caller gave that already lies under the pass radius (a token squeezed there by hand):
  // its own segment may leave it (no wall crossed), the rest keeps the radius.
  const lowStart = ends && field.clearance(pts[0].x, pts[0].y) < field.passMin;
  const lowEnd = ends && field.clearance(pts[last].x, pts[last].y) < field.passMin;
  for (let k = 1; k <= last; k++) {
    const a = pts[k - 1], b = pts[k];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / NARROW.sample));
    const exempt = (lowStart && k === 1) || (lowEnd && k === last);
    for (let s = (k === 1 ? 0 : 1); s <= n; s++) {
      const x = a.x + (b.x - a.x) * (s / n), y = a.y + (b.y - a.y) * (s / n);
      const d = field.clearance(x, y);
      if (exempt) continue;
      if (d < min) min = d;
      if (!narrow && d < field.pad - 1e-6 && field.widthAt(x, y) < 2 * field.pad - 1e-6) narrow = true;
    }
    if (!okSeg(a, b) || field.lineCross(a, b)) ok = false;
    else if (exempt && field.crosses(a, b)) ok = false;
  }
  // Samples 1/16 apart that all keep the 0.15 radius leave no room to cross a wall between them.
  if (min < field.passMin) ok = false;
  return { ok, minClearance: Number.isFinite(min) ? min : NARROW.reach, narrow };
}

/**
 * Chords over a settled band (its ends kept): each as long as its band points stay within NARROW.tol of it, its samples
 * keep the pass radius and `okSeg` lets it, at most NARROW.maxChord.
 */
export function simplify(field, P, { okSeg = () => true, tol = NARROW.tol } = {}) {
  if (P.length <= 2) return P.map(p => ({ ...p }));
  const out = [{ ...P[0] }];
  let i = 0;
  const chordOk = (i0, j0) => {
    const a = P[i0], b = P[j0];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L > NARROW.maxChord) return false;
    for (let k = i0 + 1; k < j0; k++) {
      const p = P[k];
      const dev = L > EPS ? Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L : Math.hypot(p.x - a.x, p.y - a.y);
      if (dev > tol) return false;
    }
    return checkWalk(field, [a, b], { okSeg }).ok;
  };
  while (i < P.length - 1) {
    let j = i + 1;
    for (let jj = i + 2; jj < P.length; jj++) {
      if (!chordOk(i, jj)) break;
      j = jj;
    }
    out.push({ ...P[j] });
    i = j;
  }
  return out;
}

/**
 * Round the sharp corners left (a kink of the centre line where the nearest wall changes, a jog's corner): a corner
 * turning more than NARROW.turn becomes two points NARROW.cut (at most 40 % of a leg) back along its legs, when the
 * walk there still passes; three passes. The ends are kept.
 */
export function roundTurns(field, pts, { okSeg = () => true } = {}) {
  let P = pts.map(p => ({ x: p.x, y: p.y }));
  const lim = NARROW.turn * Math.PI / 180;
  for (let pass = 0; pass < 3; pass++) {
    const out = [P[0]];
    let changed = false;
    for (let k = 1; k < P.length - 1; k++) {
      const A = out.at(-1), V = P[k], C = P[k + 1];
      const ux = V.x - A.x, uy = V.y - A.y, vx = C.x - V.x, vy = C.y - V.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 1e-6 || lv < 1e-6) { out.push(V); continue; }
      const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
      if (turn <= lim || lu < 0.08 || lv < 0.08) { out.push(V); continue; }
      const d1 = Math.min(NARROW.cut, 0.4 * lu), d2 = Math.min(NARROW.cut, 0.4 * lv);
      const p1 = { x: V.x - (ux / lu) * d1, y: V.y - (uy / lu) * d1 }, p2 = { x: V.x + (vx / lv) * d2, y: V.y + (vy / lv) * d2 };
      if (checkWalk(field, [A, p1, p2, C], { okSeg }).ok) { out.push(p1, p2); changed = true; }
      else out.push(V);
    }
    out.push(P.at(-1));
    P = out;
    if (!changed) break;
  }
  // Points closer than 0.03 to the last one kept go, where the walk past them still passes.
  const out = [P[0]];
  for (let k = 1; k < P.length - 1; k++) {
    const A = out.at(-1), V = P[k];
    if (Math.hypot(V.x - A.x, V.y - A.y) < 0.03 && checkWalk(field, [A, P[k + 1]], { okSeg }).ok) continue;
    out.push(V);
  }
  out.push(P.at(-1));
  return out;
}

/**
 * Points where a polyline's centre enters a new square (a fight's checkpoints, R9): a point NARROW.sample / 4 past
 * each crossing of a grid line is put in and marked `checkpoint`; the other points are not. The last point is.
 */
export function squareEntries(field, pts) {
  const out = [{ ...pts[0], checkpoint: false }];
  const sq = p => `${Math.floor(p.y)},${Math.floor(p.x)}`;
  for (let k = 1; k < pts.length; k++) {
    const a = out.at(-1), b = pts[k];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / (NARROW.sample / 2)));
    let cur = sq(a);
    for (let s = 1; s < n; s++) {
      const p = { x: a.x + (b.x - a.x) * (s / n), y: a.y + (b.y - a.y) * (s / n) };
      if (sq(p) !== cur) { out.push({ ...p, checkpoint: true }); cur = sq(p); }
    }
    out.push({ ...b, checkpoint: sq(b) !== cur });
  }
  out[out.length - 1].checkpoint = true;
  // A checkpoint right beside the next point is that point.
  return out.filter((p, k) => k === 0 || k === out.length - 1 || !p.checkpoint
    || Math.hypot(out[k + 1].x - p.x, out[k + 1].y - p.y) > 1e-3);
}

/* -------------------------------------------- */
/*  The walk for an A* path                     */
/* -------------------------------------------- */

/**
 * The walked polyline for an A* node path that touches a tight square (R9).
 * @param {object} field          narrowField()
 * @param {{I,J,c}[]} nodes       the A* path, absolute squares (c 0 plain, c ≥ 1 a component)
 * @param {object} o
 * @param {{x,y}} o.from          the leg's start (the token's centre), squares
 * @param {{x,y}} o.to            its goal
 * @param {boolean} [o.fight]     in a fight: only the runs through tight squares are settled (the rest stays on the
 *                                square centres), and the points where the centre line enters each square are marked
 *                                checkpoints
 * @param {(k0, k1) => number[]} [o.pull]  plain runs' string pulling: the node indices kept in [k0, k1]
 * @param {(p, q) => boolean} [o.okSeg]    the caller's own test of a straight move (tokens standing, traps, fog)
 * @returns {{ points: {x,y,checkpoint?}[], minClearance, narrow, settled } | null}
 */
export function walkFor(field, nodes, o = {}) { return drain(walkForSteps(field, nodes, o)); }

/** walkFor, yielding inside its bands (relaxSteps): the same walk, in slices. */
export function* walkForSteps(field, nodes, { from, to, fight = false, pull = null, okSeg = () => true } = {}) {
  if (!nodes?.length) return null;
  const n = nodes.length;
  const mid = k => ({ x: nodes[k].J + 0.5, y: nodes[k].I + 0.5 });
  const centreOf = k => (k === 0 ? from : k === n - 1 ? to : mid(k));
  const same = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9;
  /** A plain run's points for node k: the leg's own start or goal beside its square's centre (the plain test's). */
  const plainPts = k => {
    if (k === 0) return same(from, mid(0)) ? [from] : [from, mid(0)];
    if (k === n - 1) return same(to, mid(k)) ? [to] : [mid(k), to];
    return [mid(k)];
  };
  // Steps: fine when either end is a component or in a tight square (a plain centre there may hug a wall, or lie off
  // the centre line): a fight's walk leaves the grid from the last whole square before a narrow way to the first after.
  // Out of combat the whole leg is one band, so only the parts of tight squares need the cells.
  const fineAt = k => nodes[k].c > 0 || (fight && field.tight(nodes[k].I, nodes[k].J));
  const runs = [];                                    // [k0, k1, fine]: consecutive steps of one kind
  for (let k = 1; k < n; k++) {
    const fine = fineAt(k - 1) || fineAt(k);
    const prev = runs.at(-1);
    if (prev && prev[2] === fine) prev[1] = k;
    else runs.push([k - 1, k, fine]);
  }
  if (n === 1) runs.push([0, 0, true]);
  const P = [];                                       // the first polyline
  const marks = [];                                   // [lo, hi] indices into P of the fine runs
  for (const [a, b, fine] of runs) {
    if (P.length) P.pop();                            // a run starts on the node the last one ended on
    if (!fine) {
      const keep = pull ? pull(a, b) : Array.from({ length: b - a + 1 }, (_, m) => a + m);
      for (const k of keep) for (const p of plainPts(k)) if (!P.length || !same(P.at(-1), p)) P.push({ ...p });
    } else {
      const fp = finePath(field, nodes.slice(a, b + 1), centreOf(a), centreOf(b));
      if (!fp) return null;
      const lo = P.length;
      for (const p of fp) P.push(p);
      marks.push([lo, P.length - 1]);
    }
  }
  if (P.length < 2) P.push({ ...to });
  let pts;
  let settled = true;
  if (!fight) {
    const band = yield* relaxSteps(field, P, { okSeg });
    pts = roundTurns(field, simplify(field, band, { okSeg }), { okSeg });
    if (!checkWalk(field, pts, { okSeg, ends: true }).ok) {
      settled = false;
      pts = P.map(p => ({ x: p.x, y: p.y }));
    }
  } else {
    // Only the fine stretches settle; the plain ones keep the grid (a fight's path stays on the squares).
    // A fine stretch's points are marked `narrow` (pathfind.mjs keeps their checkpoints as they are).
    pts = [];
    let at = 0;
    for (const [lo, hi] of marks) {
      for (let k = at; k < lo; k++) pts.push({ x: P[k].x, y: P[k].y });
      const seg = P.slice(lo, hi + 1);
      let band = roundTurns(field, simplify(field, yield* relaxSteps(field, seg, { okSeg }), { okSeg }), { okSeg });
      if (!checkWalk(field, band, { okSeg, ends: true }).ok) { settled = false; band = seg; }
      const marked = squareEntries(field, band);
      if (pts.length && Math.hypot(pts.at(-1).x - marked[0].x, pts.at(-1).y - marked[0].y) < 1e-9) pts.pop();
      // Its first point is the plain node it starts from (or the leg's start): the grid's, as before.
      // Its last is the plain node it ends on (or the leg's goal): the grid's too.
      marked.forEach((p, m) => pts.push(m === 0 || m === marked.length - 1 ? { x: p.x, y: p.y } : { x: p.x, y: p.y, checkpoint: p.checkpoint, narrow: true }));
      at = hi + 1;
    }
    for (let k = at; k < P.length; k++) {
      if (pts.length && Math.hypot(pts.at(-1).x - P[k].x, pts.at(-1).y - P[k].y) < 1e-9) continue;
      pts.push({ x: P[k].x, y: P[k].y });
    }
  }
  // The checks over the stretches the band owns (all of it out of combat).
  let check;
  if (!fight) check = checkWalk(field, pts, { okSeg, ends: true });
  else {
    check = { ok: true, minClearance: NARROW.reach, narrow: false };
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      if (!field.tight(Math.floor(a.y), Math.floor(a.x)) && !field.tight(Math.floor(b.y), Math.floor(b.x))) continue;
      const c = checkWalk(field, [a, b], { okSeg, ends: k === 1 || k === pts.length - 1 });
      check.minClearance = Math.min(check.minClearance, c.minClearance);
      check.narrow ||= c.narrow;
      if (!c.ok) check.ok = false;
    }
  }
  if (!check.ok) return null;
  return { points: pts, minClearance: check.minClearance, narrow: check.narrow, settled };
}

/**
 * The pathfinder's `more` for a lattice (pathfind-core search): `toAbs(n)` the absolute square { I, J } of lattice
 * node n, `fromAbs(I, J, c)` the lattice node back; `cost(a, b)` a square step's cost (no wall test: the cells are the
 * test), null when refused; `blocked(n)` a square the token may not enter (tokens standing, traps, fog, off the scene).
 */
export function narrowMore(field, { toAbs, fromAbs, cost, blocked = () => false }) {
  return n => {
    const A = toAbs(n);
    const out = [];
    for (const x of field.more({ I: A.I, J: A.J, c: n.c ?? 0 })) {
      const m = fromAbs(x.I, x.J, x.c);
      if (x.zero) { out.push({ n: m, cost: 0 }); continue; }
      if (blocked(m)) continue;
      const c = cost(n, m);
      if (c === null || c === undefined || !Number.isFinite(c)) continue;
      out.push({ n: m, cost: c });
    }
    return out;
  };
}

/**
 * The points `dists` (squares of walk) back from a polyline's end, along it (a line behind a leader on a narrow way,
 * R9 / Fable's constraint 6): one per distance, null where the polyline is shorter.
 */
export function pointsBack(pts, dists) {
  const out = [];
  for (const d of dists) {
    let left = d, hit = null;
    for (let k = pts.length - 1; k > 0 && !hit; k--) {
      const a = pts[k], b = pts[k - 1], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= L + 1e-12) hit = L > 0 ? { x: a.x + ((b.x - a.x) * left) / L, y: a.y + ((b.y - a.y) * left) / L } : { x: a.x, y: a.y };
      else left -= L;
    }
    out.push(hit);
  }
  return out;
}
