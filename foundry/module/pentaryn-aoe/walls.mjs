/**
 * Part H — which walls stop a spell area ([declared] aoe-area-walls; feedback 7v8jPs, RpnWw3, 3arqpV).
 *
 * dnd5e 6 creates every template region with `restriction: { enabled: true, type: "move" }`, so core
 * clips the area with the movement polygon seen from each shape's origin
 * (RegionDocument#_computeShapeConstraints → #_computeShapeConstraint). Two things went wrong at the
 * table:
 *   - every wall that blocks a token clipped every area, including the invisible (move-only) walls a
 *     map uses for a bridge's sides, a cliff edge or the tavern's tables: Burning Hands stopped at
 *     the rope bridge, Web "anchored" to the furniture, and Hypnotic Pattern was cut by them too;
 *   - a cube was clipped from its corner (a rectangle's origin), a sphere from its centre, so one
 *     spell was "blocked by a corner" and the next was not.
 *
 * The rule (setting areaWalls, default "cover"; core.edgeClipsArea): an area spreads from its point
 * of origin and only total cover stops it, which on a Foundry map is a wall that blocks movement AND
 * sight. A cube is clipped from its centre (core.areaClipOrigin). The same rule for every spell,
 * physical or not: a pattern nobody can see through a solid wall stops at that wall too.
 *
 * How: a wrap of RegionDocument.prototype._computeShapeConstraint, only for template regions whose
 * restriction is "move" (dnd5e's). It builds core's own "move" polygon backend with the edge test
 * narrowed by the rule. Every caller of the constraint goes through it: the placing client's create,
 * the dragging client's update, and core's recompute when a wall changes. An area placed before
 * this keeps its old clip until it is moved (or a wall on its level changes, or areaWalls changes).
 *
 * The cube's centre needs the shapes core is constraining. During an update core passes the NEW
 * shapes to _computeShapeConstraints(changes) (region.mjs _preUpdateOperation; token.mjs when a
 * token rotates or moves the region attached to it; the region's drag animation), while
 * `this.shapes` is still the old data. A second wrap, of _computeShapeConstraints, holds
 * `changes.shapes` for the length of the call so the per-shape wrap reads those (pentaryn-aoe 0.5.1:
 * a rotated or resized cube was clipped from a centre computed with its old rotation or size).
 *
 * Changing areaWalls re-clips the template areas on the levels this client views (refreshAreaClips).
 * Adjustment row aoe-area-walls.
 */

import { MODULE, areaClipOrigin, edgeClipsArea, isTemplateRegion } from "./core.mjs";
import { onSettingChange, setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { makeLog } from "./lib/log.mjs";

const WRAPPED = Symbol.for(`${MODULE}.wallsWrapped`);
const SHAPES_WRAPPED = Symbol.for(`${MODULE}.wallsShapesWrapped`);
let patch = null;          // the _computeShapeConstraint patch; null = not installed (pass through)
let shapesPatch = null;    // the _computeShapeConstraints patch
let log = makeLog(MODULE);   // the entry's ctx.log once installed

/** The shapes of the _computeShapeConstraints call in progress (its `changes.shapes`), else null. */
let pendingShapes = null;

/** One narrowed subclass per core backend class (core may swap CONFIG.Canvas.polygonBackends.move). */
const backends = new WeakMap();

/**
 * Core's move polygon, with walls that are not total cover left out. The rule is read once per
 * constraint (computeConstraint) and handed to the polygon in its config, not read per edge.
 */
function areaBackend(Base) {
  let Narrowed = backends.get(Base);
  if (!Narrowed) {
    Narrowed = class AreaPolygon extends Base {
      _testEdgeInclusion(edge, edgeTypes) {
        if (!super._testEdgeInclusion(edge, edgeTypes)) return false;
        return edgeClipsArea(edge, this.config?.pentarynAreaWalls ?? "cover");
      }
    };
    backends.set(Base, Narrowed);
  }
  return Narrowed;
}

/**
 * The wrapper: core's own computation for anything that is not a dnd5e "move" template area, and
 * for everything once this copy is uninstalled (a wrapper left in place because something wrapped
 * on top of it can then not be removed, and must stop acting).
 */
function computeConstraint(wrapped, origin, config) {
  if (patch === null) return wrapped(origin, config);
  if (!isTemplateRegion(this) || config?.type !== "move") return wrapped(origin, config);
  const rule = setting("areaWalls");
  const Base = globalThis.CONFIG?.Canvas?.polygonBackends?.move;
  if (rule === "move" || typeof Base?.create !== "function") return wrapped(origin, config);
  const gridSize = this.parent?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const at = areaClipOrigin(pendingShapes ?? this.shapes, origin, { gridSize });
  return areaBackend(Base).create(at, { ...config, pentarynAreaWalls: rule });
}

/** Hold `changes.shapes` (the new shapes, when the call is for an update) for the length of the call. */
function computeConstraints(wrapped, changes, ...rest) {
  if (shapesPatch === null) return wrapped(changes, ...rest);
  const prior = pendingShapes;
  pendingShapes = Array.isArray(changes?.shapes) ? changes.shapes : null;
  try {
    return wrapped(changes, ...rest);
  } finally {
    pendingShapes = prior;
  }
}

function wrapConstraint() {
  const proto = globalThis.foundry?.documents?.RegionDocument?.prototype;
  if (!proto?._computeShapeConstraint) return;
  patch = wrapMethod(MODULE, {
    target: proto, name: "_computeShapeConstraint", label: "RegionDocument#_computeShapeConstraint",
    marker: WRAPPED, adjustments: "aoe-area-walls",
  }, function (wrapped, origin, config) {
    try {
      return computeConstraint.call(this, wrapped, origin, config);
    } catch (err) {
      log.error("area walls", err);
      return wrapped(origin, config);
    }
  }, { log });
  if (!proto._computeShapeConstraints) return;
  shapesPatch = wrapMethod(MODULE, {
    target: proto, name: "_computeShapeConstraints", label: "RegionDocument#_computeShapeConstraints",
    marker: SHAPES_WRAPPED, adjustments: "aoe-area-walls",
  }, function (wrapped, ...args) {
    return computeConstraints.call(this, wrapped, ...args);
  }, { log });
}

/**
 * The areaWalls setting changed (its onChange runs on every client): re-clip the template areas on
 * every level this client views. Core's Level#updateRegionShapeConstraints only queues; one designated
 * user writes (a user viewing that level who may update the region, else any who may), the same
 * path core takes when a wall changes. Only a viewed level is asked: a constraint computed for a
 * level nobody views comes back null, which would leave the area unclipped. Returns the levels asked.
 */
function refreshAreaClips(g = globalThis) {
  if (patch === null) return 0;
  const scene = g.canvas?.scene;
  if (!scene?.levels || !scene.regions?.some?.(r => isTemplateRegion(r))) return 0;
  let n = 0;
  for (const level of scene.levels.values()) {
    if (!level?.isView || typeof level.updateRegionShapeConstraints !== "function") continue;
    level.updateRegionShapeConstraints(["move"]);
    n++;
  }
  return n;
}

export function install(reg, ctx) {
  log = ctx.log;
  wrapConstraint();
  onSettingChange("areaWalls", () => {
    try { refreshAreaClips(); } catch (err) { log.error("areaWalls change", err); }
  });
}

/** Core's own constraint comes back; a hot-patched copy wraps it again with its own state. */
export function uninstall() {
  onSettingChange("areaWalls", null);
  patch?.unwrap();
  shapesPatch?.unwrap();
  patch = null;
  shapesPatch = null;
  pendingShapes = null;
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only.
// Not part of the API.
export const _internals = { WRAPPED, SHAPES_WRAPPED, areaBackend, computeConstraint, computeConstraints, wrapConstraint, refreshAreaClips };
