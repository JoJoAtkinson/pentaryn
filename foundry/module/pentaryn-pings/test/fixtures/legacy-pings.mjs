/**
 * Oracle: verbatim copies of the pure parts of pentaryn-pings/pings.mjs as of the characterisation
 * checkpoint (byte-identical to snapshot ee505c2). Nothing here imports Foundry; nothing here may
 * change once committed — the refactor proves pings-core.mjs against these bodies.
 *
 * The only edits to the copied lines, each one parameter injection:
 *   cap(raw)            :64-67   the setting read `game.settings.get(MODULE, MAX)` is the `raw` argument.
 *   isDuplicate(...)    :98-106  `recent` (the buffer's last record), the rounded `px`/`py`, `t` and
 *                                `DEDUPE_MS` are arguments; the condition is unchanged.
 *   appendCapped(...)   :111, :121-122  the pushed record and `cap()` (as `limit`) are arguments;
 *                                the buffer is returned because :122 reassigns it.
 *   roundPoint(x, y)    :93-94   unchanged maths, returned as an object.
 *   imageOffset(scene)  :132-139 unchanged.
 *   decorate(rec, getScene, nowMs)  :141-158  `game.scenes.get` and `nowMs` are parameters (guide step 1).
 *   recent(list, n)     :223     `readSetting()` is the `list` argument and `.map(decorate)` is left
 *                                to the caller; the slice/reverse is unchanged.
 */

export const DEDUPE_MS = 400;

export function cap(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 50;
}

export function roundPoint(x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  return { px, py };
}

export function isDuplicate(recent, userId, sceneId, px, py, t, DEDUPE_MS) {
  if (
    recent &&
    recent.userId === userId &&
    recent.sceneId === sceneId &&
    recent.x === px &&
    recent.y === py &&
    t - recent.t < DEDUPE_MS
  ) {
    return true;
  }
  return false;
}

export function appendCapped(buffer, rec, limit) {
  buffer.push(rec);
  if (buffer.length > limit) buffer = buffer.slice(-limit);
  return buffer;
}

/**
 * The scene padding offset — canvas coordinates minus this gives a pixel offset
 * into the background image. Foundry rounds the padding up to a whole grid
 * square, which is why this is not simply `width * padding`.
 */
export function imageOffset(scene) {
  if (!scene) return { x: 0, y: 0 };
  const g = scene.grid?.size ?? 100;
  return {
    x: Math.ceil((scene.width * scene.padding) / g) * g,
    y: Math.ceil((scene.height * scene.padding) / g) * g
  };
}

export function decorate(rec, getScene, nowMs) {
  if (!rec) return null;
  const scene = getScene(rec.sceneId);
  const off = imageOffset(scene);
  const g = scene?.grid?.size ?? 100;
  return {
    ...rec,
    canvas: { x: rec.x, y: rec.y },
    image: { x: rec.x - off.x, y: rec.y - off.y },
    gridSquare: {
      i: Math.floor((rec.x - off.x) / g),
      j: Math.floor((rec.y - off.y) / g)
    },
    /** Top-left of the grid square, i.e. what a snapped token's x/y would be. */
    snapped: { x: Math.floor(rec.x / g) * g, y: Math.floor(rec.y / g) * g },
    age: `${Math.round((nowMs() - rec.t) / 1000)}s ago`
  };
}

export const recent = (list, n = 10) => list.slice(-n).reverse();
