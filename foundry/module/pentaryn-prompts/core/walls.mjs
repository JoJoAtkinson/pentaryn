/**
 * pentaryn-prompts core — a scene's walls as plain segments, for both consumers: the sight pass
 * (sight-adapter's makeSight, per level) and the gather's door lines (scene-adapter's sceneMeta,
 * sight-blocking walls only). PURE: reads the scene document's plain fields, no Foundry global.
 */

import { wallSegment } from "./sight.mjs";

/**
 * `levelId`: keep walls on that level (a wall with no levels counts on every level); null keeps all.
 * `sightOnly`: drop walls that do not block sight (`sight` 0). Thresholds become pixels.
 * Levels / wall heights: not modelled (the gather prints a WARN when a scene has them); the place to
 * filter edges by elevation is here.
 */
export function wallSegmentsOf(scene, { levelId = null, sightOnly = false } = {}) {
  const out = [];
  const d = scene.dimensions;
  const dpx = d?.distancePixels ?? (d.size / (scene.grid?.distance || 5));
  for (const w of scene.walls ?? []) {
    if (sightOnly && !w.sight) continue;
    const lv = w.levels;
    if (levelId && lv?.size && !lv.has(levelId)) continue;
    // TODO(levels): filter by wall-height flags against the observer's elevation here.
    out.push(wallSegment({ id: w.id, c: w.c, sight: w.sight, dir: w.dir, door: w.door, ds: w.ds,
      threshold: (w.threshold?.sight ?? 0) * dpx }));
  }
  return out;
}
