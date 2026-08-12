/**
 * Wall autocomplete — the engine.
 *
 * Pure geometry. No Foundry APIs, no globals, no I/O. Takes an array of wall-shaped plain
 * objects, returns the mutations that would complete them. The caller reads the scene and
 * commits; everything in between is a deterministic function of the input coordinates.
 *
 * See playbooks/foundry-wall-autocomplete.md for the design, the rule table and the traces
 * that the fixtures in test/ replay.
 */

/* -------------------------------------------- */
/*  Configuration                               */
/* -------------------------------------------- */

/**
 * Foundry's walls-layer snap resolution for a given grid size.
 * Mirrors APP/client/canvas/layers/walls.mjs:79-86.
 */
export function snapResolution(gridSize) {
  if (gridSize >= 128) return 8;
  if (gridSize >= 64) return 4;
  return 2;
}

/**
 * Resolve the tolerance set for a scene. All distances in pixels except the *Max reaches,
 * which are given in grid squares and converted here.
 */
export function resolveConfig({gridSize = 100, ...overrides} = {}) {
  const step = gridSize / snapResolution(gridSize);
  const cfg = {
    gridSize,
    step,
    // Two endpoints this close are the same point. Must exceed authoring error yet stay
    // strictly under step/2 so it can never merge two distinct lattice points.
    weldEps: Math.max(1, Math.min(4, Math.floor(step / 4))),
    // A point this far off a carrier line still counts as on it. Integer rounding costs at
    // most 0.71px; the smallest deliberate offset is a whole lattice step.
    collEps: 2,
    // An endpoint this close to a segment is *on* it. Exactly the integer-rounding bound:
    // Math.round moves a point by at most sqrt(0.5) = 0.708px, so any rounded foot is
    // guaranteed to land inside this band. That guarantee is what makes W2 and E1
    // terminate — see the note in resolvePin().
    pinEps: 1,
    gapMax: 6,      // grid squares — longest gap F1 will bridge
    cornerMax: 6,   // grid squares — longest corner leg F2 will build
    extMax: 20,     // grid squares — longest ray E1 will chase
    // Sine of the shallowest angle at which E1 will accept a hit. A glancing hit means the
    // ray is nearly parallel to what it struck: the hit point swings wildly for a tiny
    // input change, and it almost always means the two walls were meant to be collinear.
    // 0.05 ~ 2.9 degrees.
    glanceSin: 0.05,
    // Trim overshoots before the loop. Set false to leave hand-drawn walls untouched.
    trim: true,
    iterCap: 1000,
    ...overrides
  };
  cfg.gapMaxPx = cfg.gapMax * gridSize;
  cfg.cornerMaxPx = cfg.cornerMax * gridSize;
  cfg.extMaxPx = cfg.extMax * gridSize;
  return cfg;
}

export const FLAG_SCOPE = "wall-autocomplete";

/** The solid preset — every generated wall is this. APP/client/canvas/layers/walls.mjs:370 */
export const SOLID = Object.freeze({light: 20, move: 20, sight: 20, sound: 20, door: 0, ds: 0, dir: 0});

/**
 * Rule priority. Lower fires first.
 *
 * The gradient is about *evidence*, not rule identity. Welds are cleanup and must precede
 * construction. F1 and F2 are the same strength — both are two segments agreeing on
 * something — so they share a tier and compete on cost. E1 is weaker: one segment guessing
 * along its own line.
 *
 * Ranking F1 above F2 (as this once did) is actively wrong. A T-shaped building has one
 * carrier line holding two disjoint spans, and F1 would bridge across the stem opening
 * before the cheaper shoulder corners could form, sealing the building shut.
 */
const PRIORITY = {W1: 1, W2: 2, F1: 3, F2: 3, E1: 4};

/** Instance cost is the total length of new wall the instance adds. Least wall wins. */
const COST_EPS = 1e-6;

/* -------------------------------------------- */
/*  Exact integer geometry                      */
/* -------------------------------------------- */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const dist2 = (a, b) => {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return dx * dx + dy * dy;
};
const roundPt = p => [Math.round(p[0]), Math.round(p[1])];
const keyOf = p => `${p[0]},${p[1]}`;

/** Lexicographic compare on (x, y). */
const cmpPt = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);

/** Perpendicular foot of p on the infinite line through a,b. Null for degenerate ab. */
function foot(p, a, b) {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  if (L2 === 0) return null;
  const t = dot(sub(p, a), ab) / L2;
  return {t, point: [a[0] + t * ab[0], a[1] + t * ab[1]]};
}

/** Squared distance from p to the *segment* ab (clamped). */
function distToSeg2(p, a, b) {
  const f = foot(p, a, b);
  if (!f) return dist2(p, a);
  const t = Math.max(0, Math.min(1, f.t));
  return dist2(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

/** Squared distance from p to the infinite line through a,b. */
function distToLine2(p, a, b) {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  if (L2 === 0) return dist2(p, a);
  const c = cross(ab, sub(p, a));
  return (c * c) / L2;
}

/**
 * Intersection of segment p→p2 with segment q→q2, as parameters (t, u) along each.
 * Null when parallel or collinear — collinear overlap is handled separately, exactly as
 * Foundry does it (APP/common/utils/geometry.mjs:59-66 returns null for zero denominator).
 */
function segIntersect(p, p2, q, q2) {
  const r = sub(p2, p), s = sub(q2, q);
  const denom = cross(r, s);
  if (denom === 0) return null;
  const qp = sub(q, p);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  return {t, u, point: [p[0] + t * r[0], p[1] + t * r[1]]};
}

const EPS_T = 1e-9;

/** Does segment cd block the *open* interval (a,b)? Endpoint contact on cd counts. */
function blocksOpen(a, b, c, d) {
  const x = segIntersect(a, b, c, d);
  if (x) return x.t > EPS_T && x.t < 1 - EPS_T && x.u >= -EPS_T && x.u <= 1 + EPS_T;
  // Parallel. Only a collinear overlap can block — and Foundry records no intersection for
  // those at all, so nothing else in the stack will catch it.
  if (distToLine2(c, a, b) > 0.25 || distToLine2(d, a, b) > 0.25) return false;
  const ab = sub(b, a), L2 = dot(ab, ab);
  if (L2 === 0) return false;
  const tc = dot(sub(c, a), ab) / L2, td = dot(sub(d, a), ab) / L2;
  const lo = Math.min(tc, td), hi = Math.max(tc, td);
  return hi > EPS_T && lo < 1 - EPS_T;
}

/* -------------------------------------------- */
/*  Model                                       */
/* -------------------------------------------- */

/** Wall document → internal segment. Generated walls get synthetic ids. */
function toSeg(w, idx) {
  const flags = w.flags?.[FLAG_SCOPE] ?? {};
  return {
    idx,
    id: w._id ?? w.id ?? `w${idx}`,
    c: [...w.c],
    door: w.door ?? 0,
    sight: w.sight ?? 20,
    move: w.move ?? 20,
    dir: w.dir ?? 0,
    levels: w.levels ?? [],
    keepOpen: flags.keepOpen === true,
    generated: flags.generated === true,
    isNew: false,
    dirty: false
  };
}

const segA = s => [s.c[0], s.c[1]];
const segB = s => [s.c[2], s.c[3]];
const segEnd = (s, which) => which === 0 ? segA(s) : segB(s);
const segLen2 = s => dist2(segA(s), segB(s));
const isDegenerate = s => s.c[0] === s.c[2] && s.c[1] === s.c[3];
/** dir !== 0 walls are collision-transparent from one side — never inferred from or moved. */
const isFrozen = s => s.dir !== 0;

/**
 * Build the vertex graph. Vertices are keyed by *exact* integer coordinate: all tolerance
 * lives here and in the lint pass, and every topology question downstream is an exact
 * integer comparison.
 */
function buildGraph(segs, cfg) {
  const verts = new Map();
  for (const s of segs) {
    if (isDegenerate(s)) continue;
    for (const which of [0, 1]) {
      const p = segEnd(s, which);
      const k = keyOf(p);
      let v = verts.get(k);
      if (!v) verts.set(k, v = {key: k, p, ends: [], pinned: false, keepOpen: false});
      v.ends.push({seg: s, which});
      if (s.keepOpen || isFrozen(s)) v.keepOpen = true;
    }
  }
  // Pin detection: an endpoint lying on another segment's interior, within the
  // integer-rounding band. This is what lets a partition that stops on the *interior* of an
  // exterior wall count as resolved — without it no real building ever reaches "done".
  const pinEps2 = cfg.pinEps * cfg.pinEps;
  for (const v of verts.values()) {
    const own = new Set(v.ends.map(e => e.seg.idx));
    for (const s of segs) {
      if (own.has(s.idx) || isDegenerate(s)) continue;
      const f = foot(v.p, segA(s), segB(s));
      if (!f || f.t <= 0 || f.t >= 1) continue;               // must be strictly interior
      if (dist2(v.p, f.point) <= pinEps2) { v.pinned = true; v.pinHost = s; break; }
    }
  }
  for (const v of verts.values()) {
    v.degree = v.ends.length;
    v.dangling = v.degree === 1 && !v.pinned && !v.keepOpen;
  }
  return verts;
}

const danglingOf = verts => [...verts.values()].filter(v => v.dangling).sort((a, b) => cmpPt(a.p, b.p));

/** Connected components over shared vertices and pins. Report-only — see note below. */
function components(segs, verts) {
  const parent = new Map(segs.map(s => [s.idx, s.idx]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const v of verts.values()) {
    for (let i = 1; i < v.ends.length; i++) union(v.ends[0].seg.idx, v.ends[i].seg.idx);
    if (v.pinned && v.pinHost) union(v.ends[0].seg.idx, v.pinHost.idx);
  }
  const groups = new Map();
  for (const s of segs) {
    if (isDegenerate(s)) continue;
    const r = find(s.idx);
    if (!groups.has(r)) groups.set(r, {segs: [], dangling: 0});
    groups.get(r).segs.push(s);
  }
  for (const v of verts.values()) if (v.dangling) groups.get(find(v.ends[0].seg.idx)).dangling++;
  return [...groups.values()];
}

/* -------------------------------------------- */
/*  Lint (P1) — diagnostics only, never mutates */
/* -------------------------------------------- */

function lint(segs, cfg) {
  const out = [];
  const seen = new Map();
  for (const s of segs) {
    if (isDegenerate(s)) {
      out.push({code: "N1", wall: s.id, msg: `zero-length wall at (${s.c[0]},${s.c[1]})`});
      continue;
    }
    // N2a — exact duplicates. A duplicate silently breaks the nudge-to-reopen workflow:
    // delete one wall and its twin keeps the building frozen.
    const a = segA(s), b = segB(s);
    const canon = cmpPt(a, b) <= 0 ? `${keyOf(a)}|${keyOf(b)}` : `${keyOf(b)}|${keyOf(a)}`;
    if (seen.has(canon)) out.push({code: "N2", wall: s.id, msg: `duplicate of ${seen.get(canon)}`});
    else seen.set(canon, s.id);
    // N5 — the sweep's vertex key is 65536*x + y (geometry/edges/vertex.mjs:38-48).
    if (s.c.some(v => Math.abs(v) >= 65536)) out.push({code: "N5", wall: s.id, msg: `coordinate >= 65536, vertex keys collide`});
    if (s.c.some(v => !Number.isInteger(v))) out.push({code: "N1", wall: s.id, msg: `non-integer coordinate`});
  }
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], t = segs[j];
      if (isDegenerate(s) || isDegenerate(t)) continue;
      // N2b — collinear overlap. Records no intersection anywhere in Foundry, so nothing
      // else in the stack will ever notice it.
      if (distToLine2(segA(t), segA(s), segB(s)) <= 0.25 && distToLine2(segB(t), segA(s), segB(s)) <= 0.25) {
        const ab = sub(segB(s), segA(s)), L2 = dot(ab, ab);
        if (L2 > 0) {
          const tc = dot(sub(segA(t), segA(s)), ab) / L2, td = dot(sub(segB(t), segA(s)), ab) / L2;
          const lo = Math.min(tc, td), hi = Math.max(tc, td);
          if (hi > EPS_T && lo < 1 - EPS_T && (hi - lo) > EPS_T) {
            out.push({code: "N2", wall: s.id, msg: `collinear overlap with ${t.id}`});
          }
        }
      }
      // N3 — a wall crossing a door keeps blocking after the door opens.
      if ((s.door !== 0) !== (t.door !== 0)) {
        const x = segIntersect(segA(s), segB(s), segA(t), segB(t));
        if (x && x.t > EPS_T && x.t < 1 - EPS_T && x.u > EPS_T && x.u < 1 - EPS_T) {
          const dr = s.door !== 0 ? s : t, wl = s.door !== 0 ? t : s;
          out.push({code: "N3", wall: wl.id, msg: `crosses door ${dr.id} mid-span — will not block when the door opens`});
        }
      }
    }
  }
  // N4 — near misses beyond the weld band. Refuses to weld; tells you where to nudge.
  // Only loose ends count: two endpoints 5px apart that are already joined through a short
  // wall are a deliberately short wall, not a mistake, and reporting those buries the real
  // signal under jamb-width noise.
  const lo2 = cfg.weldEps * cfg.weldEps, hi2 = (cfg.step / 2) * (cfg.step / 2);
  const degree = new Map();
  const pts = [];
  for (const s of segs) {
    if (isDegenerate(s)) continue;
    for (const p of [segA(s), segB(s)]) {
      degree.set(keyOf(p), (degree.get(keyOf(p)) ?? 0) + 1);
      pts.push(p);
    }
  }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d2 = dist2(pts[i], pts[j]);
      if (d2 <= lo2 || d2 > hi2) continue;
      if (degree.get(keyOf(pts[i])) > 1 && degree.get(keyOf(pts[j])) > 1) continue;
      out.push({code: "N4", msg: `endpoints (${pts[i]}) and (${pts[j]}) are ${Math.round(Math.sqrt(d2))}px apart — too far to weld, close enough to be a mistake`});
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Trim (P2.5)                                 */
/* -------------------------------------------- */

/**
 * X1 — trim overshoots. Draw long crossing lines, get a clean room: any part of a wall that
 * pokes past a crossing and ends in mid-air is cut back to that crossing.
 *
 * Deliberately a **single-shot pass over the original crossing set**, not a loop rule, and
 * deliberately restricted to *proper* crossings (both segments crossed through their
 * interiors). Both restrictions exist for the same reason. Once a wall has been trimmed its
 * endpoint merely *touches* the other wall, and an endpoint-touching-an-interior is
 * geometrically identical to a partition T-ing into a long wall — where trimming would
 * destroy half the wall. Freezing the crossing set up front separates "I drew these
 * overlapping" from "I drew a T", which local geometry alone cannot.
 */
function trimOvershoots(segs, verts, cfg) {
  const pinEps2 = cfg.pinEps * cfg.pinEps;
  const crossings = new Map();
  const note = (idx, rec) => {
    if (!crossings.has(idx)) crossings.set(idx, []);
    crossings.get(idx).push(rec);
  };
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], o = segs[j];
      if (isDegenerate(s) || isDegenerate(o)) continue;
      const x = segIntersect(segA(s), segB(s), segA(o), segB(o));
      if (!x) continue;
      if (x.t <= EPS_T || x.t >= 1 - EPS_T) continue;   // interior to s
      if (x.u <= EPS_T || x.u >= 1 - EPS_T) continue;   // and interior to o
      // A "crossing" within the rounding band of an endpoint is a T-touch that rounding
      // pushed a fraction of a pixel to the wrong side — exactly what E1 produces when it
      // pins to a diagonal. Treating it as a real crossing lets trim amputate the host.
      const ends = [segA(s), segB(s), segA(o), segB(o)];
      if (ends.some(e => dist2(x.point, e) <= pinEps2)) continue;
      note(s.idx, {t: x.t, point: x.point, other: o});
      note(o.idx, {t: x.u, point: x.point, other: s});
    }
  }

  const trims = [];
  for (const s of segs) {
    const xs = crossings.get(s.idx);
    if (!xs?.length) continue;
    // A door's length is its opening width — semantic, not incidental. Never trim one.
    if (s.door !== 0 || isFrozen(s)) continue;
    for (const which of [0, 1]) {
      const v = verts.get(keyOf(segEnd(s, which)));
      if (!v?.dangling) continue;
      const near = which === 0
        ? xs.reduce((a, b) => (b.t < a.t ? b : a))
        : xs.reduce((a, b) => (b.t > a.t ? b : a));
      // An overshoot is by nature the small leftover. If the piece we would remove is the
      // *longer* half, this is not an overshoot — it is a wall that happens to cross
      // something near its far end, and cutting it back would amputate it.
      const removed = which === 0 ? near.t : 1 - near.t;
      if (removed >= 0.5) { trims.push({seg: s, which, declined: removed}); continue; }
      const P = roundPt(near.point);
      if (keyOf(P) !== keyOf(segEnd(s, which))) trims.push({seg: s, which, to: P, other: near.other});
    }
  }
  return trims;
}

/* -------------------------------------------- */
/*  Rules (P3)                                  */
/* -------------------------------------------- */

/** Outward direction at a dangling endpoint: away from the segment body. */
function outward(v) {
  const {seg, which} = v.ends[0];
  return sub(segEnd(seg, which), segEnd(seg, 1 - which));
}

/** Is q strictly on the outward ray from v? */
function isOutward(v, q) {
  return dot(sub(q, v.p), outward(v)) > 0;
}

/** Every non-degenerate segment is an obstacle — including inert components. */
function obstacles(segs, exclude = new Set()) {
  return segs.filter(s => !isDegenerate(s) && !exclude.has(s.idx));
}

function pathClear(a, b, segs, exclude) {
  for (const s of obstacles(segs, exclude)) {
    if (blocksOpen(a, b, segA(s), segB(s))) return false;
  }
  return true;
}

/**
 * How many dangling ends, other than the excluded ones, shoot their outward ray into the
 * closed interval [a,b] within reach. Two or more is the signature of a passage mouth.
 */
function aimCount(a, b, verts, cfg, exclude) {
  let n = 0;
  const reach2 = cfg.extMaxPx * cfg.extMaxPx;
  const gapDir = sub(b, a);
  const gapLen = Math.sqrt(dot(gapDir, gapDir));
  for (const v of verts.values()) {
    if (!v.dangling || exclude.has(v.key)) continue;
    const d = outward(v);
    // A ray running *along* the gap is not aiming into it — it is F1-partner material. A
    // door tilted a pixel off its wall line used to read as an aim and blow the guard up,
    // refusing every fill on that line.
    if (gapLen > 0 && Math.abs(cross(d, gapDir)) / (Math.sqrt(dot(d, d)) * gapLen) < cfg.glanceSin) continue;
    const x = segIntersect(v.p, [v.p[0] + d[0], v.p[1] + d[1]], a, b);
    if (!x || x.t <= EPS_T) continue;                       // forward only
    if (x.u < -EPS_T || x.u > 1 + EPS_T) continue;          // lands within the gap
    if (dist2(v.p, [v.p[0] + x.t * d[0], v.p[1] + x.t * d[1]]) > reach2) continue;
    n++;
  }
  return n;
}

/** No existing vertex strictly inside the open interval (a,b). */
function intervalEmptyOfVertices(a, b, verts) {
  for (const v of verts.values()) {
    if (keyOf(v.p) === keyOf(a) || keyOf(v.p) === keyOf(b)) continue;
    const f = foot(v.p, a, b);
    if (!f || f.t <= EPS_T || f.t >= 1 - EPS_T) continue;
    if (dist2(v.p, f.point) <= 0.25) return false;
  }
  return true;
}

function enumerate(segs, verts, cfg) {
  const dang = danglingOf(verts);
  const out = [];

  // W1 — endpoint weld. Two dangling ends within the weld band become one vertex.
  const weld2 = cfg.weldEps * cfg.weldEps;
  for (let i = 0; i < dang.length; i++) {
    for (let j = i + 1; j < dang.length; j++) {
      const a = dang[i], b = dang[j];
      if (a.ends[0].seg.idx === b.ends[0].seg.idx) continue;
      const d2 = dist2(a.p, b.p);
      if (d2 > 0 && d2 <= weld2) {
        const [keep, move] = cmpPt(a.p, b.p) <= 0 ? [a, b] : [b, a];
        out.push({rule: "W1", cost: Math.sqrt(d2), lex: [keep.p, move.p], anchors: [a.key, b.key],
                  act: {kind: "move", vertex: move, to: keep.p}});
      }
    }
  }

  // W2 — pin snap. A dangling end near another wall's interior snaps onto it. The rounded
  // foot is within 0.71px of the host, so pinEps=1 guarantees the result *is* pinned and
  // this rule can never fire twice on the same endpoint.
  for (const v of dang) {
    let best = null;
    for (const s of obstacles(segs, new Set([v.ends[0].seg.idx]))) {
      const f = foot(v.p, segA(s), segB(s));
      if (!f || f.t <= 0 || f.t >= 1) continue;
      const d2 = dist2(v.p, f.point);
      if (d2 > 0 && d2 <= weld2 && (!best || d2 < best.d2)) best = {d2, f, seg: s};
    }
    if (best) {
      const to = roundPt(best.f.point);
      if (keyOf(to) !== v.key) {
        out.push({rule: "W2", cost: Math.sqrt(best.d2), lex: [v.p, to], anchors: [v.key],
                  act: {kind: "move", vertex: v, to}});
      }
    }
  }

  // F1 — collinear gap fill. The strongest evidence there is: two segments on one line.
  for (let i = 0; i < dang.length; i++) {
    for (let j = i + 1; j < dang.length; j++) {
      const a = dang[i], b = dang[j];
      const A = a.ends[0].seg, B = b.ends[0].seg;
      if (A.idx === B.idx) continue;
      const coll2 = cfg.collEps * cfg.collEps;
      const onA = distToLine2(segA(B), segA(A), segB(A)) <= coll2 && distToLine2(segB(B), segA(A), segB(A)) <= coll2;
      const onB = distToLine2(segA(A), segA(B), segB(B)) <= coll2 && distToLine2(segB(A), segA(B), segB(B)) <= coll2;
      if (!onA || !onB) continue;
      if (!isOutward(a, b.p) || !isOutward(b, a.p)) continue;
      const d2 = dist2(a.p, b.p);
      if (d2 > cfg.gapMaxPx * cfg.gapMaxPx) continue;
      const ex = new Set([A.idx, B.idx]);
      if (!intervalEmptyOfVertices(a.p, b.p, verts)) continue;
      if (!pathClear(a.p, b.p, segs, ex)) continue;
      // Passage guard. Two *other* loose ends aiming into this gap say it is a mouth, not a
      // missing wall — a T's stem, an alley between buildings, the throat of an E. That is
      // conflicting evidence, so refuse rather than seal it. One end aiming in is the
      // ordinary T-junction (a partition running up to a wall line) and still fills; the
      // asymmetry between one aim and two is what makes this safe.
      if (aimCount(a.p, b.p, verts, cfg, new Set([a.key, b.key])) >= 2) continue;
      out.push({rule: "F1", cost: Math.sqrt(d2), lex: [a.p, b.p], anchors: [a.key, b.key],
                act: {kind: "create", walls: [[...a.p, ...b.p]]}});
    }
  }

  // F2 — junction inference. Two *or more* carriers voting for the same point.
  //
  // A plain corner is the two-leg case; a T is three legs and a crossroads is four. Every
  // interior junction of a multi-room floorplan is a T or a cross, so treating F2 as
  // strictly pairwise made dense interiors unbuildable: the four ends meeting at one
  // junction produced six equal-cost pairings, which the ambiguity detector — correctly,
  // given what it was told — read as six ways to guess, and refused them all.
  //
  // Carriers agreeing on one point is *stronger* evidence than two, not weaker. So group
  // candidate pairs by their rounded meeting point and build every leg at once. Atomic, as
  // before: P must be born at degree ≥ 2 or D would not decrease.
  const max2 = cfg.cornerMaxPx * cfg.cornerMaxPx;
  const junctions = new Map();
  for (let i = 0; i < dang.length; i++) {
    for (let j = i + 1; j < dang.length; j++) {
      const a = dang[i], b = dang[j];
      if (a.ends[0].seg.idx === b.ends[0].seg.idx) continue;
      const da = outward(a), db = outward(b);
      if (cross(da, db) === 0) continue;
      // Carriers meeting at a glancing angle are the near-collinear band, which F1 refuses
      // (COLL_EPS) and E1 refuses (GLANCE_SIN) — F2 was the only rule without the guard, and
      // would build a long sliver running a few px above an existing wall. Same constant, so
      // the whole band is now refused uniformly by every rule.
      if (Math.abs(cross(da, db)) / (Math.sqrt(dot(da, da)) * Math.sqrt(dot(db, db))) < cfg.glanceSin) continue;
      const x = segIntersect(a.p, [a.p[0] + da[0], a.p[1] + da[1]], b.p, [b.p[0] + db[0], b.p[1] + db[1]]);
      if (!x) continue;
      const P = roundPt(x.point);
      if (!isOutward(a, P) || !isOutward(b, P)) continue;
      const la2 = dist2(a.p, P), lb2 = dist2(b.p, P);
      if (la2 === 0 || lb2 === 0 || la2 > max2 || lb2 > max2) continue;
      const k = keyOf(P);
      if (!junctions.has(k)) junctions.set(k, {P, ends: new Map()});
      const j2 = junctions.get(k).ends;
      j2.set(a.key, a);
      j2.set(b.key, b);
    }
  }
  // Junction points within WELD_EPS are one junction — the same semantics W1 already applies
  // to endpoints ("points that would weld are the same point"). Without it, nearest-only
  // membership has a knife edge: two junction candidates 1px apart split a room's corner in
  // two, and a 1px nudge flips the topology of the whole building.
  const clusters = [];
  for (const e of [...junctions.values()].sort((u, v) => cmpPt(u.P, v.P))) {
    const near = clusters.find(c => dist2(c.P, e.P) <= cfg.weldEps * cfg.weldEps);
    if (near) for (const [k, v] of e.ends) near.ends.set(k, v);
    else clusters.push({P: e.P, ends: new Map(e.ends)});
  }

  // A loose end joins only the *nearest* junction it can reach. Without this the merge is
  // greedy and swallows anything within CORNER_MAX: an alley between two buildings gets
  // bridged because one building's end can reach the other's corner, even though its own
  // corner is nearer. Nearest-only is local, needs no notion of "structure", and reads as
  // one sentence — a wall turns at the first junction it meets, not a farther one.
  const nearest = new Map();
  for (const {P, ends} of clusters) {
    for (const v of ends.values()) {
      const L = Math.sqrt(dist2(v.p, P));
      if (!nearest.has(v.key) || L < nearest.get(v.key) - COST_EPS) nearest.set(v.key, L);
    }
  }
  for (const {P, ends} of clusters) {
    // Re-check reachability against the whole membership: a leg must not cross another
    // member's wall on its way in.
    const all = [...ends.values()].sort((u, v) => cmpPt(u.p, v.p));
    const ex = new Set(all.map(v => v.ends[0].seg.idx));
    const legs = all.filter(v =>
      Math.sqrt(dist2(v.p, P)) <= nearest.get(v.key) + COST_EPS && pathClear(v.p, P, segs, ex));
    if (legs.length < 2) continue;
    const cost = legs.reduce((sum, v) => sum + Math.sqrt(dist2(v.p, P)), 0);
    out.push({rule: "F2", cost, lex: [legs[0].p, legs[1].p], anchors: legs.map(v => v.key), corner: P,
              act: {kind: "create", walls: legs.map(v => [...v.p, ...P])}});
  }

  // E1 — dangling extension. The weakest evidence: one segment shooting a ray along its own
  // carrier until it hits something. Fires last, which is why the shell always closes first.
  for (const v of dang) {
    const hit = castRay(v, segs, cfg);
    if (hit && !hit.refusal) {
      out.push({rule: "E1", cost: Math.sqrt(dist2(v.p, hit.H)), lex: [v.p, hit.H], anchors: [v.key],
                act: {kind: "create", walls: [[...v.p, ...hit.H]]}});
    }
  }

  return out;
}

/**
 * Cast the outward ray from a dangling endpoint and find the nearest obstacle contact.
 * Returns {H, seg} on success, {refusal} when it hits nothing in range or lands mid-door.
 */
function castRay(v, segs, cfg) {
  const d = outward(v);
  const ex = new Set([v.ends[0].seg.idx]);
  let best = null;
  for (const s of obstacles(segs, ex)) {
    const r = d, sVec = sub(segB(s), segA(s));
    const denom = cross(r, sVec);
    if (denom === 0) continue;                        // parallel — F1's job, not E1's
    const qp = sub(segA(s), v.p);
    const t = cross(qp, sVec) / denom;
    const u = cross(qp, r) / denom;
    if (t <= EPS_T || u < -EPS_T || u > 1 + EPS_T) continue;
    if (!best || t < best.t) best = {t, u, seg: s, point: [v.p[0] + t * r[0], v.p[1] + t * r[1]]};
  }
  // An aligned wall lying along the ray is F1's business, not E1's — extending into it would
  // lay wall on top of wall, silently doing what GAP_MAX refused to do. castRay skips
  // parallels when looking for a hit, so without this the weaker rule circumvents the
  // stronger one's bound. Only a wall starting *strictly* closer than the hit counts: one
  // that starts exactly at the hit is a weld, not an overlap.
  // Band is half a lattice step, NOT COLL_EPS. COLL_EPS is "did the user mean these to be
  // one line"; this is "would the new wall run alongside an existing one". Between the two
  // sits a gap where F1 refuses as not-collinear-enough while E1 happily builds a duplicate
  // wall a few px away and then welds onto it. Half a step is the right width because the
  // smallest *deliberate* offset the wall tool can produce is a whole step — anything under
  // that is drawing error.
  const band = Math.max(cfg.collEps, cfg.step / 2);
  const coll2 = band * band;
  const dLen2 = dot(d, d);
  const ahead = [v.p[0] + d[0], v.p[1] + d[1]];
  for (const s of obstacles(segs, ex)) {
    if (cross(d, sub(segB(s), segA(s))) !== 0) continue;
    if (distToLine2(segA(s), v.p, ahead) > coll2) continue;
    const t0 = dot(sub(segA(s), v.p), d) / dLen2, t1 = dot(sub(segB(s), v.p), d) / dLen2;
    const far = Math.max(t0, t1);
    if (far <= EPS_T) continue;                              // entirely behind
    const startT = Math.max(Math.min(t0, t1), 0);
    if (best && startT >= best.t - EPS_T) continue;          // begins at or past the hit
    const away = Math.sqrt(startT * startT * dLen2);
    return {refusal: `an aligned wall (${s.id}) lies along this line ${(away / cfg.gridSize).toFixed(1)} squares out — close that gap by hand, or nudge the two onto one line`};
  }
  if (!best) return {refusal: "nothing along this line to grow to"};
  const sVec = sub(segB(best.seg), segA(best.seg));
  const sinT = Math.abs(cross(d, sVec)) / (Math.sqrt(dot(d, d)) * Math.sqrt(dot(sVec, sVec)));
  if (sinT < cfg.glanceSin) {
    return {refusal: `only meets ${best.seg.id} at a ${(Math.asin(sinT) * 180 / Math.PI).toFixed(1)}° glancing angle — nearly collinear, nudge onto the line`};
  }
  const H = roundPt(best.point);
  const dd = Math.sqrt(dist2(v.p, H));
  if (dd === 0) return {refusal: "degenerate hit"};
  if (dd > cfg.extMaxPx) {
    return {refusal: `nearest wall is ${(dd / cfg.gridSize).toFixed(1)} squares away (max ${cfg.extMax})`};
  }
  // Stopping mid-door leaves a wall dead-ending into an opening that vanishes when the door
  // opens. Windows are fine — they block movement and stay put (design trace D2).
  if (best.seg.door !== 0 && best.u > EPS_T && best.u < 1 - EPS_T) {
    return {refusal: `would land mid-door (${best.seg.id}) — move the stub or the door`};
  }
  return {H, seg: best.seg};
}

/* -------------------------------------------- */
/*  Ambiguity                                   */
/* -------------------------------------------- */

/**
 * Refuse when one endpoint has two equally-good partners producing *different* geometry —
 * that is a guess the user cannot predict from looking at the map. Two independent
 * instances that merely share a cost are not ambiguous: both get built, and the order
 * doesn't change the outcome, so those tie-break lexicographically.
 */
function ambiguousAnchors(instances) {
  const byAnchor = new Map();
  for (const inst of instances) {
    for (const k of inst.anchors) {
      if (!byAnchor.has(k)) byAnchor.set(k, []);
      byAnchor.get(k).push(inst);
    }
  }
  const bad = new Map();
  for (const [k, list] of byAnchor) {
    // Pool by *tier*, not by rule: F1 and F2 now compete in the same tier, so an F1 and an
    // F2 on one anchor at equal cost is exactly as unpredictable as two F2s would be.
    const byRule = new Map();
    for (const inst of list) {
      const tier = PRIORITY[inst.rule];
      if (!byRule.has(tier)) byRule.set(tier, []);
      byRule.get(tier).push(inst);
    }
    for (const [tier, group] of byRule) {
      const rule = group.map(g => g.rule).join("/");
      if (group.length < 2) continue;
      group.sort((a, b) => a.cost - b.cost);
      if (Math.abs(group[0].cost - group[1].cost) > COST_EPS) continue;
      const g0 = JSON.stringify(group[0].act), g1 = JSON.stringify(group[1].act);
      if (g0 !== g1) {
        bad.set(k, {rule, candidates: group.filter(g => Math.abs(g.cost - group[0].cost) <= COST_EPS)});
      }
    }
  }
  return bad;
}

const cmpInstance = (a, b) =>
  (PRIORITY[a.rule] - PRIORITY[b.rule]) ||
  (Math.abs(a.cost - b.cost) > COST_EPS ? a.cost - b.cost : 0) ||
  cmpPt(a.lex[0], b.lex[0]) ||
  cmpPt(a.lex[1], b.lex[1]);

/* -------------------------------------------- */
/*  Apply                                       */
/* -------------------------------------------- */

function applyInstance(inst, segs, runId) {
  if (inst.act.kind === "move") {
    const {seg, which} = inst.act.vertex.ends[0];
    const prior = [...seg.c];
    if (which === 0) { seg.c[0] = inst.act.to[0]; seg.c[1] = inst.act.to[1]; }
    else { seg.c[2] = inst.act.to[0]; seg.c[3] = inst.act.to[1]; }
    if (!seg.priorC) seg.priorC = prior;
    seg.dirty = true;
    seg.rule = inst.rule;
    return;
  }
  for (const c of inst.act.walls) {
    const donor = inst.anchors.length ? inst.anchors[0] : null;
    segs.push({
      idx: segs.length,
      id: `gen-${runId}-${segs.length}`,
      c: [...c],
      ...SOLID,
      levels: inst.levels ?? [],
      keepOpen: false,
      generated: true,
      isNew: true,
      dirty: false,
      rule: inst.rule,
      sources: inst.anchors,
      donor
    });
  }
}

/* -------------------------------------------- */
/*  Refusal diagnosis (P4)                      */
/* -------------------------------------------- */

function diagnose(v, segs, verts, cfg, ambiguous) {
  if (ambiguous.has(v.key)) {
    const {rule, candidates} = ambiguous.get(v.key);
    const where = candidates.map(c => c.corner ? `(${c.corner})` : `(${c.lex[1]})`).join(" and ");
    return `${rule} ambiguous — two equally close candidates at ${where}; finish this one by hand`;
  }
  const reasons = [];
  const coll2 = cfg.collEps * cfg.collEps;
  const A = v.ends[0].seg;
  for (const w of danglingOf(verts)) {
    if (w.key === v.key) continue;
    const B = w.ends[0].seg;
    if (A.idx === B.idx) continue;
    const onA = distToLine2(segA(B), segA(A), segB(A)) <= coll2 && distToLine2(segB(B), segA(A), segB(A)) <= coll2;
    const d = Math.sqrt(dist2(v.p, w.p));
    if (onA && isOutward(v, w.p) && d > cfg.gapMaxPx) {
      reasons.push(`aligned with ${B.id} but ${(d / cfg.gridSize).toFixed(1)} squares apart (max ${cfg.gapMax})`);
      continue;
    }
    // Near-collinear-but-not: the band where "fill the gap" and "build a corner" both look
    // plausible. Refusing is the whole point — a rule that guesses here surprises you.
    if (!onA && isOutward(v, w.p) && d <= cfg.gapMaxPx) {
      const off = Math.sqrt(Math.max(distToLine2(segA(B), segA(A), segB(A)), distToLine2(segB(B), segA(A), segB(A))));
      if (off <= cfg.collEps * 8) reasons.push(`nearly collinear with ${B.id} (off by ${off.toFixed(1)}px, max ${cfg.collEps}) — nudge onto the line`);
    }
    const da = outward(v), db = outward(w);
    if (cross(da, db) !== 0) {
      const x = segIntersect(v.p, [v.p[0] + da[0], v.p[1] + da[1]], w.p, [w.p[0] + db[0], w.p[1] + db[1]]);
      if (x) {
        const P = roundPt(x.point);
        if (isOutward(v, P) && isOutward(w, P)) {
          const la = Math.sqrt(dist2(v.p, P)), lb = Math.sqrt(dist2(w.p, P));
          if (la > cfg.cornerMaxPx || lb > cfg.cornerMaxPx) {
            reasons.push(`corner with ${B.id} at (${P}) needs a ${(Math.max(la, lb) / cfg.gridSize).toFixed(1)}-square leg (max ${cfg.cornerMax})`);
          } else if (!pathClear(v.p, P, segs, new Set([A.idx, B.idx])) || !pathClear(w.p, P, segs, new Set([A.idx, B.idx]))) {
            reasons.push(`corner with ${B.id} at (${P}) is blocked by another wall`);
          }
        }
      }
    }
  }
  const ray = castRay(v, segs, cfg);
  // F1's "aligned but too far" and E1's "an aligned wall lies along this line" are the same
  // finding seen from two rules. Say it once.
  if (ray?.refusal && !reasons.some(r => {
    const m = ray.refusal.match(/\((\S+?)\)/);
    return m && (r.includes(`aligned with ${m[1]} `) || r.includes(`nearly collinear with ${m[1]} `));
  })) reasons.push(ray.refusal);
  return reasons.length ? reasons.join("; ") : "no rule applies";
}

/* -------------------------------------------- */
/*  Entry point                                 */
/* -------------------------------------------- */

/**
 * Run the engine over a set of wall documents.
 *
 * @param {object[]} walls  Wall-document-shaped objects: {_id, c, door, sight, move, dir, levels, flags}
 * @param {object}   opts   {gridSize, ...tolerance overrides}
 * @returns {{creates, updates, refusals, lints, report, log}}
 */
export function runEngine(walls, opts = {}) {
  const cfg = resolveConfig(opts);
  const runId = opts.runId ?? "run";
  const all = walls.map(toSeg);

  // P0 — partition by `levels`. Walls on different levels never interact; edges are
  // level-keyed (APP/client/canvas/geometry/edges/edge.mjs:138-141).
  const byLevel = new Map();
  for (const s of all) {
    const k = JSON.stringify([...(s.levels ?? [])].sort());
    if (!byLevel.has(k)) byLevel.set(k, []);
    byLevel.get(k).push(s);
  }

  const creates = [], updates = [], refusals = [], log = [];
  let lints = [], iterations = 0, componentReport = [];

  for (const [levelKey, group] of byLevel) {
    const segs = group.map((s, i) => ({...s, c: [...s.c], idx: i}));
    lints = lints.concat(lint(segs, cfg));

    let verts = buildGraph(segs, cfg);

    // P2.5 — trim overshoots, all at once, from the original crossing set.
    if (cfg.trim) {
      const byWall = new Map();
      for (const t of trimOvershoots(segs, verts, cfg)) {
        if (t.declined) {
          lints.push({code: "N6", wall: t.seg.id, msg: `crosses another wall ${Math.round(t.declined * 100)}% of the way along — trimming there would remove more than half of it; left alone`});
          continue;
        }
        if (!byWall.has(t.seg.idx)) byWall.set(t.seg.idx, []);
        byWall.get(t.seg.idx).push(t);
      }
      for (const [idx, list] of byWall) {
        const s = segs[idx];
        // Both ends overshooting to the *same* crossing means the wall only touches the
        // rest of the drawing at one point — trimming would collapse it to nothing.
        if (list.length === 2 && keyOf(list[0].to) === keyOf(list[1].to)) {
          lints.push({code: "N6", wall: s.id, msg: `both ends overshoot the same crossing at (${list[0].to}) — trimming would collapse it; left alone`});
          continue;
        }
        for (const t of list) {
          if (!s.priorC) s.priorC = [...s.c];
          if (t.which === 0) { s.c[0] = t.to[0]; s.c[1] = t.to[1]; }
          else { s.c[2] = t.to[0]; s.c[3] = t.to[1]; }
          s.dirty = true;
          s.rule = "X1";
          log.push({iter: 0, rule: "X1", act: "trim", walls: [[...s.c]]});
        }
      }
      if (byWall.size) verts = buildGraph(segs, cfg);
    }

    // P3 — the fixed-point loop. One mutation per iteration, so the whole run is a
    // replayable list of single steps and the measure is checked after every one.
    let D = danglingOf(verts).length;
    let ambiguous = new Map();

    for (let iter = 1; iter <= cfg.iterCap; iter++) {
      const instances = enumerate(segs, verts, cfg);
      ambiguous = ambiguousAnchors(instances);
      const eligible = instances.filter(i => !i.anchors.some(k => ambiguous.has(k)));
      if (!eligible.length) { iterations = Math.max(iterations, iter); break; }

      eligible.sort(cmpInstance);

      // Apply every mutation in this pass that provably cannot affect any other one already
      // accepted: disjoint anchors, and a disjoint bounding box for the geometry it creates.
      //
      // Soundness. Disjoint anchors means no accepted mutation consumed one of this one's
      // members, so its membership is intact; and since applying a mutation only ever
      // *removes* dangling ends, it can only remove competing junction candidates, never add
      // a nearer one — so a member's nearest junction cannot change out from under it.
      // Disjoint boxes means no accepted new wall can block this one's legs or be struck by
      // its ray. Order is still the sorted order, so output is unchanged.
      //
      // Without this, one mutation per pass makes a big map quadratic in passes: a 400-wall
      // scene took 401 passes and 22 seconds. Independent rooms now settle in parallel.
      const inflate = 1;
      const boxOf = inst => {
        const pts = inst.act.kind === "create"
          ? inst.act.walls.flatMap(c => [[c[0], c[1]], [c[2], c[3]]])
          : [inst.act.vertex.p, inst.act.to];
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        return [Math.min(...xs) - inflate, Math.min(...ys) - inflate,
                Math.max(...xs) + inflate, Math.max(...ys) + inflate];
      };
      const disjoint = (a, b) => a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];

      const batch = [], usedAnchors = new Set(), boxes = [];
      for (const inst of eligible) {
        if (inst.anchors.some(a => usedAnchors.has(a))) continue;
        const bb = boxOf(inst);
        if (boxes.some(b => !disjoint(b, bb))) continue;
        batch.push(inst);
        for (const a of inst.anchors) usedAnchors.add(a);
        boxes.push(bb);
      }

      for (const inst of batch) {
        inst.levels = JSON.parse(levelKey);
        applyInstance(inst, segs, runId);
        log.push({iter, rule: inst.rule, cost: Math.round(inst.cost), act: inst.act.kind,
                  walls: inst.act.walls ?? [inst.act.to]});
      }

      verts = buildGraph(segs, cfg);
      const D2 = danglingOf(verts).length;
      // The real safety net. The cap is a backstop; this is the assertion that names the
      // offending rule at the exact step. No rule can increase D, because nothing is ever
      // split and every created endpoint is born welded or pinned.
      if (D2 >= D) {
        const first = batch[0];
        throw new Error(
          `wall-autocomplete: pass ${iter} applied ${batch.length} mutation(s) but the ` +
          `dangling-endpoint count did not fall (${D} -> ${D2}). The rule set is unsound for ` +
          `this input; nothing was committed. First mutation was ${first.rule}: ` +
          `${JSON.stringify(first.act.walls ?? first.act.to)}`
        );
      }
      D = D2;
      iterations = Math.max(iterations, iter + 1);
    }

    if (iterations > cfg.iterCap) throw new Error(`wall-autocomplete: hit the ${cfg.iterCap}-iteration cap; nothing was committed.`);

    // P4 — refusal sweep. Reports only; geometry is untouched.
    for (const v of danglingOf(verts)) {
      refusals.push({at: v.p, wall: v.ends[0].seg.id, why: diagnose(v, segs, verts, cfg, ambiguous)});
    }

    componentReport = componentReport.concat(components(segs, verts).map(c => ({
      walls: c.segs.length, dangling: c.dangling, closed: c.dangling === 0
    })));

    // P5 — collect mutations. The caller commits; nothing has touched Foundry yet.
    const stamp = {generated: true, run: runId};
    for (const s of segs) {
      if (s.isNew) {
        creates.push({c: s.c, ...SOLID, levels: s.levels,
                      flags: {[FLAG_SCOPE]: {...stamp, rule: s.rule, sources: s.sources ?? []}}});
      } else if (s.dirty) {
        updates.push({_id: s.id, c: s.c,
                      flags: {[FLAG_SCOPE]: {...stamp, rule: s.rule, priorC: s.priorC}}});
      }
    }
  }

  return {
    creates, updates, refusals, lints, log,
    report: {
      iterations,
      created: creates.length,
      moved: updates.length,
      refused: refusals.length,
      components: componentReport,
      config: {gridSize: cfg.gridSize, weldEps: cfg.weldEps, collEps: cfg.collEps, pinEps: cfg.pinEps,
               gapMax: cfg.gapMax, cornerMax: cfg.cornerMax, extMax: cfg.extMax}
    }
  };
}
