/**
 * B1 — wall spells drawn so they can be seen (feedback 8t6Nn1, Talo's Wall of Stone, 2026-11-19).
 *
 * dnd5e 6 maps the `wall` area type to a ray, so a wall spell's region is one or more line shapes
 * whose width is the wall's thickness: 0.25 ft for Wall of Stone's Long Panels, a 2.5 px line on a
 * 50 px grid. Core draws a template region with highlightMode "coverage" (the grid squares it covers,
 * and a panel that thin covers almost none) tinted in the caster's user colour, so in Talo's dark
 * green on a dark swamp map the wall "turned green and disappeared".
 *
 * On every client, `refreshRegion` (core's hook after a Region placeable applies its render flags)
 * gives a wall spell's region (core.wallSpellRegion) one extra PIXI.Graphics child on the Region
 * PLACEABLE: each line shape drawn core.wallThickness thick (its width, or a fifth of a square when
 * that is thinner), filled in a neutral stone grey with a solid dark stroke, not the user colour. The
 * shape data is never changed, so which creatures the area holds is exactly what it was; and no
 * Wall documents are made (B2, a separate decision). The drawing follows the placeable: hidden with
 * it, gone with a redraw (core destroys the children; the next refresh adds it again) and with the
 * region. Adjustment row core-region-wall-panels.
 */

import { MODULE, isTemplateRegion, wallPanelOutline, wallSpellRegion } from "./core.mjs";
import { makeLog } from "./lib/log.mjs";

/** Where the drawing hangs on the placeable (one per region). */
const OVERLAY = Symbol.for(`${MODULE}.wallPanels`);
/** Neutral stone: a mid grey fill, a dark stroke (readable on light and dark maps, in any user colour). */
export const WALL_FILL = 0x8f949b;
export const WALL_STROKE = 0x2b2e33;
const FILL_ALPHA = 0.7;
const STROKE_PX = 2;

let log = makeLog(MODULE);   // the entry's ctx.log once installed

/** The plain description core.wallSpellRegion reads. */
function describe(doc) {
  const flags5e = doc?.flags?.dnd5e ?? {};
  let templateType = null;
  if (flags5e.activity) {
    let activity = null;
    try { activity = fromUuidSync(flags5e.activity, { strict: false }); } catch { activity = null; }
    templateType = activity?.target?.template?.type || null;
  }
  return {
    template: isTemplateRegion(doc),
    shapeTypes: [...(doc?.shapes ?? [])].map(s => s?.type),
    templateType,
    height: flags5e.dimensions?.height ?? null,
  };
}

function dropOverlay(region) {
  const g = region?.[OVERLAY];
  if (!g) return;
  delete region[OVERLAY];
  if (!g.destroyed) {
    g.parent?.removeChild?.(g);
    g.destroy?.();
  }
}

/** refreshRegion: (re)draw the panels of a wall spell's region. Never touches any other region. */
export function onRefreshRegion(region) {
  const doc = region?.document;
  if (!doc || !wallSpellRegion(describe(doc))) return dropOverlay(region);
  let g = region[OVERLAY];
  if (!g || g.destroyed) {
    g = new PIXI.Graphics();
    g.eventMode = "none";
    region.addChildAt ? region.addChildAt(g, 0) : region.addChild(g);
    region[OVERLAY] = g;
  }
  g.clear();
  const grid = canvas?.grid?.size ?? canvas?.dimensions?.size ?? 0;
  const shapes = region.animationState?.shapes ?? doc.shapes ?? [];
  for (const shape of shapes) {
    if (shape?.type !== "line") continue;
    g.lineStyle(STROKE_PX, WALL_STROKE, 1);
    g.beginFill(WALL_FILL, FILL_ALPHA);
    g.drawPolygon(wallPanelOutline(shape, grid));
    g.endFill();
  }
  return g;
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("refreshRegion", reg.guardSwallowAsync("refreshRegion(wall)", onRefreshRegion), { guard: false, label: "refreshRegion(wall)" });
}

/** The drawings go with the hook: every region on the canvas loses its panel overlay. */
export function uninstall() {
  try {
    for (const region of globalThis.canvas?.regions?.placeables ?? []) dropOverlay(region);
  } catch (err) { log.warn("wall panels uninstall", err); }
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only. Not part of the API.
export const _internals = { describe, dropOverlay, OVERLAY };
