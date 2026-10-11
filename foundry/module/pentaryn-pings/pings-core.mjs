/**
 * Pentaryn Ping Log — PURE core: constants and the ping rules.
 *
 * No Foundry global at runtime, so every rule here runs in node on plain fixtures. The glue reads
 * scene and user fields and passes plain data in; nothing here imports glue.
 *
 * Quirks kept as they are on purpose (transform-creatures-36, README "Pitfalls"):
 *   recentOf(list, 0) returns the whole list, and a negative n drops records from the oldest end;
 *   `snapped` is square-grid maths whatever the grid type; a fractional limit below 1 never trims.
 */

export const MODULE = "pentaryn-pings";
export const SHORT = "pings";
export const NS = "pings";
export const VERSION = "0.1.0";                       // === module.json version (core-meta.test pins it)
export const CONTRACT = "pentaryn-pings/api@1";       // bump the major on a published-shape change
export const I18N = "PENTARYN_PINGS";
export const CSS = "ppg-";
export const FLAG_SCOPE = MODULE;

/** Events this module emits: none. */
export const HOOKS = Object.freeze({});

/** The same ping can arrive through both capture paths inside this window (ms). */
export const DEDUPE_MS = 400;
/** A burst of pings is written once, this long after the first (ms). */
export const FLUSH_MS = 250;
/** Pings kept when the `max` setting is unusable, and the most it may ask for. */
export const DEFAULT_MAX = 50;
export const MAX_CAP = 500;
/** Grid size assumed for a scene with none. */
export const DEFAULT_GRID = 100;

/**
 * True when `rec` repeats the buffer's last record: same user, scene and (already rounded) point,
 * stamped less than `windowMs` after it. Only the last record is compared.
 * @param {{userId, sceneId, x, y, t}|null|undefined} last
 * @param {{userId, sceneId, x, y}} rec
 * @param {number} now
 * @param {number} [windowMs]
 */
export function isDuplicate(last, rec, now, windowMs = DEDUPE_MS) {
  return !!(
    last &&
    last.userId === rec.userId &&
    last.sceneId === rec.sceneId &&
    last.x === rec.x &&
    last.y === rec.y &&
    now - last.t < windowMs
  );
}

/** The `max` setting's raw value → how many pings to keep: finite and positive, at most MAX_CAP, else DEFAULT_MAX. */
export function capLimit(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_CAP) : DEFAULT_MAX;
}

/**
 * Append `rec` and keep the newest `limit`. Under the cap the SAME array is pushed to and returned
 * (live, that array can be the settings cache — the readers then see the ping before the flush);
 * over it, a fresh slice is returned.
 */
export function appendCapped(buffer, rec, limit) {
  buffer.push(rec);
  if (buffer.length > limit) buffer = buffer.slice(-limit);
  return buffer;
}

/**
 * The scene padding offset — canvas coordinates minus this give a pixel offset into the background
 * image. Foundry rounds the padding up to a whole grid square, which is why this is not simply
 * `width * padding`. No scene → `{x: 0, y: 0}`.
 * @param {{width: number, height: number, padding: number, gridSize?: number}|null|undefined} scene
 */
export function imageOffset(scene) {
  if (!scene) return { x: 0, y: 0 };
  const g = scene.gridSize ?? DEFAULT_GRID;
  return {
    x: Math.ceil((scene.width * scene.padding) / g) * g,
    y: Math.ceil((scene.height * scene.padding) / g) * g,
  };
}

/**
 * A stored record with its coordinates in every space a caller needs. `rec` keys come first, then
 * canvas, image, gridSquare, snapped, age (whole seconds, text) and ageMs (`now - rec.t`, a number).
 * @param {object|null|undefined} rec
 * @param {{offset?: {x: number, y: number}, gridSize?: number}} scene  imageOffset() and grid size
 * @param {number} now  ms
 */
export function decorate(rec, { offset, gridSize } = {}, now) {
  if (!rec) return null;
  const off = offset ?? { x: 0, y: 0 };
  const g = gridSize ?? DEFAULT_GRID;
  return {
    ...rec,
    canvas: { x: rec.x, y: rec.y },
    image: { x: rec.x - off.x, y: rec.y - off.y },
    gridSquare: {
      i: Math.floor((rec.x - off.x) / g),
      j: Math.floor((rec.y - off.y) / g),
    },
    /** Top-left of the grid square, i.e. what a snapped token's x/y would be. */
    snapped: { x: Math.floor(rec.x / g) * g, y: Math.floor(rec.y / g) * g },
    age: `${Math.round((now - rec.t) / 1000)}s ago`,
    ageMs: now - rec.t,
  };
}

/** The last `n` records, newest first (default 10). n = 0 → all of them (pinned quirk). */
export const recentOf = (list, n = 10) => list.slice(-n).reverse();
