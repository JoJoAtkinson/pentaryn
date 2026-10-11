/**
 * Part G — a Self cone or line starts at its caster and points at the mouse.
 *
 * dnd5e 6 places every activity area through core's RegionLayer#placeRegions with no onMove of its
 * own, so a cone's point follows the mouse and faces east until the mouse wheel turns it. For a
 * spell whose range is Self (Cone of Cold, Burning Hands, Lightning Bolt) the point belongs on the
 * caster: the usability Area 6 re-run (W13) placed Cone of Cold at the click with rotation 0 and
 * caught a Fighter instead of the goblins.
 *
 * `dnd5e.preCreateMeasuredTemplate` fires just before dnd5e starts the placement. For a Self-range
 * cone or line with a caster token on this scene we arm one aim; our wrap of
 * `RegionLayer.prototype.placeRegions` consumes it and passes an `onMove` (core's documented
 * placement option) that keeps the shape's origin on the edge of the caster's token, toward the
 * pointer, and its rotation pointing at the pointer. Click confirms as before; Escape and
 * right-click cancel as before (Part E / F). The handle (Part A) can still be dragged afterwards.
 *
 * Setting: aimSelfAreas (world, default on). Row aoe-self-area-aim.
 */

import { MODULE, aimFromCaster, aimsFromCaster } from "./core.mjs";
import { setting } from "./settings.mjs";
import { on, guard } from "./hooks.mjs";

const ARM_MS = 5000;
let armed = null;          // { tokenId, sceneId, until }
const WRAPPED = Symbol.for(`${MODULE}.aimWrapped`);

function casterToken(activity) {
  let token = null;
  try { token = activity?.getUsageToken?.() ?? null; } catch { token = null; }
  const doc = token?.document ?? token;
  if (!doc || doc.parent?.id !== canvas?.scene?.id) return null;
  return doc;
}

function onPreCreate(activity) {
  armed = null;
  if (!setting("aimSelfAreas")) return;
  const target = activity?.target?.template ?? {};
  const templateType = CONFIG.DND5E?.areaTargetTypes?.[target.type]?.template ?? null;
  if (!aimsFromCaster({ rangeUnits: activity?.range?.units ?? null, templateType })) return;
  const doc = casterToken(activity);
  if (!doc) return;
  armed = { tokenId: doc.id, sceneId: doc.parent.id, until: Date.now() + ARM_MS };
}

/** The onMove for one placement: origin on the caster's edge, rotation toward the pointer. */
function aimer(tokenId) {
  return ({ shape, position }) => {
    if (!["cone", "line"].includes(shape?.type)) return;          // anything else: core's default
    const doc = canvas.scene?.tokens?.get(tokenId);
    if (!doc) return;
    const g = canvas.grid.size;
    const w = (doc.width ?? 1) * g, h = (doc.height ?? 1) * g;
    const centre = { x: doc.x + w / 2, y: doc.y + h / 2 };
    const aim = aimFromCaster(centre, w / 2, h / 2, position);
    shape.updateSource({ x: aim.x, y: aim.y, rotation: aim.rotation });
    return false;
  };
}

function wrapPlacement() {
  const Layer = foundry.canvas?.layers?.RegionLayer;
  const proto = Layer?.prototype;
  if (!proto?.placeRegions || proto[WRAPPED]) return;
  const own = proto.placeRegions;
  proto.placeRegions = function placeRegions(data, options = {}) {
    const a = armed;
    armed = null;
    if (a && Date.now() < a.until && a.sceneId === canvas.scene?.id && setting("aimSelfAreas")) {
      const mine = aimer(a.tokenId);
      const theirs = options.onMove;
      options = { ...options, onMove: args => {
        const r = theirs?.(args);
        if (r === false) return false;
        return mine(args);
      } };
    }
    return own.call(this, data, options);
  };
  proto[WRAPPED] = true;
}

export function installAim() {
  wrapPlacement();
  on("dnd5e.preCreateMeasuredTemplate", guard("preCreateMeasuredTemplate(aim)", onPreCreate));
}
