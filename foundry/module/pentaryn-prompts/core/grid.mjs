/**
 * pentaryn-prompts core — distance bands, bearings, grid distance on squares and hexes.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

/* ── Bands (2024 PHB anchors, see the plan §4.2) ─────────────────────────── */

export const BANDS = Object.freeze([
  [5, "touching"], [10, "reach"], [30, "close"], [60, "near"], [150, "far"], [Infinity, "distant"]
]);

/** The band for a distance in feet. 0 (overlapping squares) is `touching`. */
export function band(ft) {
  const d = Number(ft);
  if (!Number.isFinite(d)) return "distant";
  for (const [max, name] of BANDS) if (d <= max) return name;
  return "distant";
}

/* ── Bearing ─────────────────────────────────────────────────────────────── */

export const COMPASS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

/**
 * 8-point compass bearing from `from` to `to` on the map, north up (canvas y grows downward).
 * Sectors are 45° wide centred on each point; an exact sector edge (22.5°) rounds clockwise.
 * Same point → "".
 */
export function bearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return "";
  let deg = Math.atan2(dx, -dy) * 180 / Math.PI;    // 0 = north, clockwise
  if (deg < 0) deg += 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/* ── Grid distance ───────────────────────────────────────────────────────── */

/** `CONST.GRID_DIAGONALS`, restated. */
export const DIAGONALS = Object.freeze({
  EQUIDISTANT: 0, EXACT: 1, APPROXIMATE: 2, RECTILINEAR: 3, ALTERNATING_1: 4, ALTERNATING_2: 5, ILLEGAL: 6
});

/**
 * Not a core diagonal rule: the "squares" are hex cube coordinates `{i: q, j: r}` (scene-adapter.mjs maps
 * `HexagonalGrid#offsetToCube` into them) and a step is one hex.
 */
export const HEX_RULE = "hex";

/** Cost in squares of a straight move of `di` rows and `dj` columns under a diagonal rule. */
export function stepCost(di, dj, rule = DIAGONALS.EQUIDISTANT) {
  if (rule === HEX_RULE) return (Math.abs(di) + Math.abs(dj) + Math.abs(di + dj)) / 2;   // cube distance
  const a = Math.max(Math.abs(di), Math.abs(dj));
  const b = Math.min(Math.abs(di), Math.abs(dj));
  switch (rule) {
    case DIAGONALS.EXACT: return (a - b) + b * Math.SQRT2;
    case DIAGONALS.APPROXIMATE: return (a - b) + b * 1.5;
    case DIAGONALS.RECTILINEAR:
    case DIAGONALS.ILLEGAL: return a + b;
    case DIAGONALS.ALTERNATING_1: return a + Math.floor(b / 2);   // 5-10-5
    case DIAGONALS.ALTERNATING_2: return a + Math.ceil(b / 2);    // 10-5-10
    default: return a;                                            // 2024 default: every diagonal 5 ft
  }
}

/**
 * The grid squares a rectangle occupies: every square whose centre lies inside it. A footprint
 * smaller than one square (tiny, 0.5) occupies the square under its own centre — the same answer
 * `TokenDocument#getOccupiedGridSpaceOffsets` gives for an unwalled square grid.
 * `rect` is in canvas pixels; the square grid's origin is canvas (0, 0).
 */
export function occupiedSquares(rect, gridSize) {
  const g = gridSize;
  const out = [];
  const i0 = Math.floor(rect.y / g), i1 = Math.ceil((rect.y + rect.h) / g);
  const j0 = Math.floor(rect.x / g), j1 = Math.ceil((rect.x + rect.w) / g);
  for (let i = i0; i < i1; i++) {
    const cy = (i + 0.5) * g;
    if (cy <= rect.y || cy >= rect.y + rect.h) continue;
    for (let j = j0; j < j1; j++) {
      const cx = (j + 0.5) * g;
      if (cx <= rect.x || cx >= rect.x + rect.w) continue;
      out.push({ i, j });
    }
  }
  if (!out.length) {
    out.push({ i: Math.floor((rect.y + rect.h / 2) / g), j: Math.floor((rect.x + rect.w / 2) / g) });
  }
  return out;
}

/** Remove duplicate {i, j} (Foundry's 3D offsets repeat a square per elevation step). */
export function dedupeSquares(squares) {
  const seen = new Set();
  const out = [];
  for (const s of squares ?? []) {
    const k = `${s.i},${s.j}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ i: s.i, j: s.j });
  }
  return out;
}

/**
 * The nearest pair of squares between two footprints and their cost in squares.
 * Overlapping footprints cost 0; adjacent (including diagonally, under the 5e rule) cost 1.
 */
export function nearestPair(squaresA, squaresB, rule = DIAGONALS.EQUIDISTANT) {
  let best = null;
  for (const a of squaresA) {
    for (const b of squaresB) {
      const cost = stepCost(b.i - a.i, b.j - a.j, rule);
      if (!best || cost < best.cost) best = { a, b, cost };
      if (cost === 0) return best;
    }
  }
  return best ?? { a: null, b: null, cost: Infinity };
}

/** Grid distance in feet between two footprints, nearest occupied squares, rounded to 0.1 ft. */
export function squareDistanceFt(squaresA, squaresB, { gridFt = 5, rule = DIAGONALS.EQUIDISTANT } = {}) {
  const { cost } = nearestPair(squaresA, squaresB, rule);
  return Math.round(cost * gridFt * 10) / 10;
}

/**
 * Gridless distance: the gap between two rectangles (0 when they touch or overlap), converted to
 * feet and rounded UP to the next 5 ft, minimum 5 — "adjacent" still reads as touching.
 */
export function gaplessDistanceFt(rectA, rectB, pxPerFt, step = 5) {
  const dx = Math.max(0, rectB.x - (rectA.x + rectA.w), rectA.x - (rectB.x + rectB.w));
  const dy = Math.max(0, rectB.y - (rectA.y + rectA.h), rectA.y - (rectB.y + rectB.h));
  const ft = Math.hypot(dx, dy) / pxPerFt;
  return Math.max(step, Math.ceil(ft / step) * step);
}
