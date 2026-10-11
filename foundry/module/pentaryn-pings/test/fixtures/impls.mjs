/**
 * The implementations core.test proves against the same tables, all in the pure-core shape that
 * guide step 2 gives pings-core.mjs (transform-creatures-36):
 *
 *   DEDUPE_MS · isDuplicate(last, rec, now, windowMs) · capLimit(raw) · appendCapped(buffer, rec, limit)
 *   imageOffset({width, height, padding, gridSize}) · decorate(rec, {offset, gridSize}, now) · recentOf(list, n)
 *
 * Today the only entry is the verbatim oracle (fixtures/legacy-pings.mjs) behind thin adapters that
 * map that shape onto the snapshot's own argument lists. Step 2 appends ["core", core]; the frozen
 * core.test never changes.
 */
import * as legacy from "./legacy-pings.mjs";

/** A scene that reproduces `offset` through legacy imageOffset: valid while offset is a multiple of g. */
function sceneFor({ offset, gridSize } = {}) {
  const g = gridSize ?? 100;
  if (offset.x % g || offset.y % g) throw new Error("adapter: offset must be a whole number of grid squares");
  return { width: offset.x, height: offset.y, padding: 1, grid: gridSize === undefined ? undefined : { size: gridSize } };
}

export const oracle = {
  DEDUPE_MS: legacy.DEDUPE_MS,
  isDuplicate: (last, rec, now, windowMs) => legacy.isDuplicate(last, rec.userId, rec.sceneId, rec.x, rec.y, now, windowMs),
  capLimit: raw => legacy.cap(raw),
  appendCapped: (buffer, rec, limit) => legacy.appendCapped(buffer, rec, limit),
  imageOffset: info =>
    legacy.imageOffset(
      info == null
        ? info
        : { width: info.width, height: info.height, padding: info.padding, grid: info.gridSize === undefined ? undefined : { size: info.gridSize } }
    ),
  decorate: (rec, info, now) => legacy.decorate(rec, () => (rec ? sceneFor(info) : null), () => now),
  recentOf: (list, ...n) => legacy.recent(list, ...n),
};

export const IMPLS = [["oracle", oracle]];
