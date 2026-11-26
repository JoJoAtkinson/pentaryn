/**
 * Pentaryn Movement — the narrow field (0.10 step N): NARROW, the polyline resampler and narrowField, the lazy cell field
 * a wall set makes (tight squares, cells, nodes, clearance, settle). Pure, no Foundry globals. Part of the
 * narrow-core.mjs barrel, which says what the whole is for.
 */

import { EPS, N8, sqKey, segNear, segThroughBox, openFrom } from "./narrow-geom.mjs";

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

