/**
 * Pentaryn Movement — the narrow walk (0.10 step N): the fine path through a run of nodes, the band settled on it, its
 * checks, and the walk for an A* path (walkFor, narrowMore, pointsBack). Pure, no Foundry globals. Part of the
 * narrow-core.mjs barrel, which says what the whole is for.
 */

import { EPS, N8, sqKey } from "./narrow-geom.mjs";
import { NARROW, resample } from "./narrow-field.mjs";

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
