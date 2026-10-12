/**
 * pentaryn-prompts core — line of sight against plain wall segments (the pure fallback and the door pass).
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

/* ── Line of sight against wall segments (pure fallback + the door pass) ─── */

/** CONST.EDGE_SENSE_TYPES / EDGE_DIRECTIONS / WALL_DOOR_*, restated. */
export const SENSE = Object.freeze({ NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30, DISTANCE: 40 });
export const DIR = Object.freeze({ BOTH: 0, LEFT: 1, RIGHT: 2 });
export const DOOR = Object.freeze({ NONE: 0, DOOR: 1, SECRET: 2 });
export const DOOR_STATE = Object.freeze({ CLOSED: 0, OPEN: 1, LOCKED: 2 });

/** Foundry's orient2dFast. */
export function orient(a, b, c) {
  return (a.y - c.y) * (b.x - c.x) - (a.x - c.x) * (b.y - c.y);
}

/**
 * Where segment p→q crosses segment a→b, as the parameter t along p→q, or null.
 * Touching at the ray's own origin (t = 0) is not a crossing; reaching the far end is.
 */
export function segmentT(p, q, a, b) {
  const rx = q.x - p.x, ry = q.y - p.y;
  const sx = b.x - a.x, sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (den === 0) return null;                                       // parallel / collinear
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  const eps = 1e-9;
  if (t <= eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return t;
}

/**
 * Normalise a WallDocument-ish object (`c: [x0, y0, x1, y1]`) into a segment record.
 * `threshold` is the sight threshold in PIXELS (the caller converts from grid units).
 */
export function wallSegment(w) {
  const c = w.c ?? [w.a?.x, w.a?.y, w.b?.x, w.b?.y];
  return {
    id: w.id ?? w._id ?? null,
    a: { x: c[0], y: c[1] }, b: { x: c[2], y: c[3] },
    sight: w.sight ?? SENSE.NORMAL,
    dir: w.dir ?? DIR.BOTH,
    door: w.door ?? DOOR.NONE,
    ds: w.ds ?? DOOR_STATE.CLOSED,
    threshold: Number(w.threshold) > 0 ? Number(w.threshold) : 0
  };
}

/**
 * Core's `Edge#applyThreshold` for sight from `origin` (no external radius): true when the wall
 * stops counting — a PROXIMITY wall seen from within its threshold, a DISTANCE wall from beyond it.
 */
export function thresholdApplies(w, origin) {
  if (!w.threshold || w.sight < SENSE.PROXIMITY) return false;
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((origin.x - w.a.x) * dx + (origin.y - w.a.y) * dy) / len2)) : 0;
  const d = Math.hypot(w.a.x + t * dx - origin.x, w.a.y + t * dy - origin.y);
  return w.sight === SENSE.PROXIMITY ? d < w.threshold : d > w.threshold;
}

/**
 * Does a sight ray from `origin` to `dest` pass the walls? Mirrors core's inclusion rules for a
 * sight polygon: sense NONE and open doors pass; a one-way wall seen from its open side passes
 * (`side === dir`); collinear walls pass; LIMITED walls block from the second one crossed;
 * NORMAL blocks; PROXIMITY / DISTANCE block unless their threshold applies from the origin (as
 * core's `useThreshold`). Core's own test is the primary pass; this is the fallback and the door
 * classifier.
 *
 * `ignoreDoors: true` lets every door through, closed or not (the "would a door explain it" pass).
 * Returns `{ clear, doors }` — `doors` are the closed doors on the ray (for the secret tag).
 */
export function rayPasses(origin, dest, walls, { ignoreDoors = false } = {}) {
  let limited = 0;
  const doors = [];
  let blocked = false;
  for (const raw of walls ?? []) {
    const w = raw.a && raw.b && "sight" in raw ? raw : wallSegment(raw);
    if (!w.sight) continue;
    const isDoor = w.door !== DOOR.NONE;
    if (isDoor && w.ds === DOOR_STATE.OPEN) continue;
    const o = orient(w.a, w.b, origin);
    if (o === 0) continue;
    if (w.dir !== DIR.BOTH) {
      const side = o < 0 ? DIR.LEFT : DIR.RIGHT;
      if (side === w.dir) continue;
    }
    if (w.threshold && thresholdApplies(w, origin)) continue;
    if (segmentT(origin, dest, w.a, w.b) === null) continue;
    if (isDoor) {
      doors.push(w);
      if (ignoreDoors) continue;
    }
    if (w.sight === SENSE.LIMITED) {
      if (++limited >= 2) blocked = true;
    } else blocked = true;
  }
  return { clear: !blocked, doors };
}

/**
 * Classify sight from one thing to another over plain wall data: `"LOS"` when any target point is
 * clear, otherwise `"door"` / `"secret door"` when letting doors through would clear it, else
 * `"wall"`. `origins` is usually one point (the observer's centre); `targets` the target's points.
 */
export function classifySight(origins, targets, walls) {
  for (const o of origins) for (const t of targets) if (rayPasses(o, t, walls).clear) return "LOS";
  return classifyBlocked(origins, targets, walls);
}

/** The door pass alone, for a pair the primary test already found blocked. */
export function classifyBlocked(origins, targets, walls) {
  let secretOnly = null;
  for (const o of origins) {
    for (const t of targets) {
      const r = rayPasses(o, t, walls, { ignoreDoors: true });
      if (!r.clear) continue;
      const plain = r.doors.some(d => d.door !== DOOR.SECRET);
      if (plain) return "door";
      if (r.doors.length) secretOnly = "secret door";
    }
  }
  return secretOnly ?? "wall";
}

/**
 * Is a relation a clear sight line? Reads the lazy boolean `seen` when the relation has one
 * (makeRel's do), so asking never triggers the door/wall classification.
 */
export function isSeen(r) {
  if (!r) return false;
  return "seen" in r ? !!r.seen : r.los === "LOS";
}
