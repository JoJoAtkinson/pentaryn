/**
 * pentaryn-prompts — sight over scene documents, for any scene, viewed or not.
 *
 * Primary pass: core's own sight collision (`CONFIG.Canvas.polygonBackends.sight.testCollision`)
 * on the item's Level, light ignored (`edgeTypes.source: false`), thresholds honoured. Doors are
 * as they stand: closed blocks, open passes. Visible when any of the target's test points is clear.
 *
 * Second pass, for blocked pairs only: the pure wall test with doors let through. Clear there →
 * "door" (or "secret door" when every door on the way is secret), else "wall".
 *
 * If core's test throws (an API drift after an update), the pure test does both passes and a
 * warning is logged once.
 *
 * Levels / wall heights: not modelled (the gather prints a WARN when a scene has them). The place
 * to filter edges by elevation is `wallsFor` below.
 */

import { MODULE, classifyBlocked, rayPasses, wallSegment } from "./geometry-core.mjs";

let warned = false;

/** Plain wall segments on a level (walls with no level set count on every level). */
function wallsFor(scene, levelId) {
  const out = [];
  const dpx = scene.dimensions?.distancePixels ?? (scene.dimensions.size / (scene.grid?.distance || 5));
  for (const w of scene.walls ?? []) {
    const lv = w.levels;
    if (levelId && lv?.size && !lv.has(levelId)) continue;
    // TODO(levels): filter by wall-height flags against the observer's elevation here.
    out.push(wallSegment({ id: w.id, c: w.c, sight: w.sight, dir: w.dir, door: w.door, ds: w.ds,
      threshold: (w.threshold?.sight ?? 0) * dpx }));
  }
  return out;
}

/** Does this scene have wall heights or more than one level (LOS here ignores both)? */
export function heightWarning(scene) {
  const levels = scene.levels?.size ?? 1;
  const heights = (scene.walls ?? []).some(w => {
    const f = w.flags?.["wall-height"];
    return f && (Number.isFinite(f.top) || Number.isFinite(f.bottom));
  });
  if (heights) return "wall heights present, LOS ignores them";
  if (levels > 1) return `${levels} levels; sight is tested on each thing's own level only`;
  return null;
}

/**
 * Sight over items built by model.mjs (`{origin, points, centre, level}`), directional (A looks at
 * B), as the two halves makeRel evaluates lazily:
 *   visible(A, B)  → boolean, core's test (any of B's test points clear);
 *   classify(A, B) → "door" | "secret door" | "wall", the door pass for a pair already blocked.
 * Measured on a 1,578-wall scene: ~95 µs per core test, ~9 test points per 1×1 token, so a blocked
 * pair is ~0.7 ms — which is why nothing here runs unless a consumer reads it.
 */
export function makeSight(scene) {
  const backend = globalThis.CONFIG?.Canvas?.polygonBackends?.sight;
  const multi = (scene.levels?.size ?? 1) > 1;
  let core = !!backend?.testCollision;
  const cache = new Map();
  const walls = id => {
    if (!cache.has(id)) cache.set(id, wallsFor(scene, id));
    return cache.get(id);
  };
  const levelOf = A => (A.level && scene.levels?.get?.(A.level)) || scene.firstLevel || null;
  const originOf = A => A.origin ?? A.centre;
  const targetsOf = B => (B.points?.length ? B.points : [B.centre]);

  function visible(A, B) {
    const level = levelOf(A);
    const origin = originOf(A);
    const targets = targetsOf(B);
    if (core && level) {
      try {
        for (const p of targets) {
          const dest = { x: p.x, y: p.y, elevation: p.elevation ?? origin.elevation ?? 0 };
          const hit = backend.testCollision(origin, dest, {
            type: "sight", mode: "any", level, useThreshold: true, edgeTypes: { source: false }
          });
          if (hit) continue;
          if (multi && scene.testSurfaceCollision?.(origin, dest, { type: "sight", mode: "any", level })) continue;
          return true;
        }
        return false;
      } catch (err) {
        core = false;   // this scene model falls back for good; one warning per page
        if (!warned) {
          console.warn(`${MODULE} | core sight test failed, using the plain wall test`, err);
          warned = true;
        }
      }
    }
    const segs = walls(level?.id ?? null);
    return targets.some(t => rayPasses(origin, t, segs).clear);
  }

  function classify(A, B) {
    const level = levelOf(A);
    return classifyBlocked([originOf(A)], targetsOf(B), walls(level?.id ?? null));
  }

  return { visible, classify };
}
