// Pentaryn Tool Cursors — pure rules. No Foundry globals: node test/run.mjs and tools/build.mjs import this.
//
// keyFor() maps the active scene control + tool (and whether a spell-area placement is following the
// mouse) to a cursor key, or null for the plain system arrow. KEYS is the cursor set from DESIGN.md: the
// build script rasterises from it and writes cursors.css; the module and README read it.

export const MODULE = "pentaryn-cursors";
export const SHORT = "cursors";
export const NS = "cursors";
export const VERSION = "0.2.0";
export const CONTRACT = "pentaryn-cursors/api@1";
export const I18N = "PENTARYN_CURSORS";
export const CSS = "pcur-";
/** Hooks this module emits: none. */
export const HOOKS = Object.freeze({});

/** Drawing tools that place a shape. Drawings `select` is not one of them. */
export const DRAW_TOOLS = Object.freeze(["rect", "ellipse", "polygon", "freehand", "text"]);

/**
 * The set. `hotspot` is the design value in CSS px on the 32×32 cursor; the build recomputes it
 * from the fitted glyph and fails on drift > 1 px. `fallback` is the keyword used if the image
 * fails to load (never `auto`: a dropped image must still look "not the arrow").
 * `extreme` tells the build which glyph extreme the hotspot sits on.
 */
export const KEYS = Object.freeze({
  target: Object.freeze({ when: "tokens.target", src: "target--delapouite-crosshair.svg", colour: "#FF5252", colourName: "Ember", hotspot: [16, 16], fallback: "crosshair", extreme: "centre" }),
  ruler: Object.freeze({ when: "tokens.ruler", src: "ruler--fa-free-ruler.svg", colour: "#FFD43B", colourName: "Brass", hotspot: [25, 6], fallback: "cell", extreme: "up-right" }),
  aoe: Object.freeze({ when: "spell area placement following the mouse (core RegionLayer#placeRegions), any tool", src: "aoe--delapouite-convergence-target.svg", colour: "#4DD9FF", colourName: "Glow", hotspot: [16, 16], fallback: "crosshair", extreme: "centre" }),
  note: Object.freeze({ when: "notes.journal", src: "note--delapouite-position-marker.svg", colour: "#FF6AD5", colourName: "Rose", hotspot: [16, 28], fallback: "copy", extreme: "bottom" }),
  draw: Object.freeze({ when: "drawings.rect / ellipse / polygon / freehand / text", src: "draw--fa-free-pencil.svg", colour: "#69E05A", colourName: "Moss", hotspot: [3, 28], fallback: "crosshair", extreme: "down-left" })
});

/**
 * The cursor key for a control/tool state, or null for the system arrow.
 * @param {{control?: string, tool?: string, templatesActive?: boolean}} state  templatesActive: a spell-area
 *   placement is following the mouse (see placementActive). The name predates dnd5e 6, kept because
 *   game.pentaryn.cursors.keyFor is public.
 * @returns {string|null}
 */
export function keyFor({ control, tool, templatesActive } = {}) {
  if (templatesActive) return "aoe";
  if (control === "tokens") {
    if (tool === "target") return "target";
    if (tool === "ruler") return "ruler";
    return null;
  }
  if (control === "notes" && tool === "journal") return "note";
  if (control === "drawings" && DRAW_TOOLS.includes(tool)) return "draw";
  return null; // select, toggles, buttons, GM layers → system arrow
}

/**
 * Is a spell-area placement following the mouse? dnd5e 6 places every activity area through core
 * RegionLayer#placeRegions (dnd5e TemplatePlacement#_place); AbilityTemplate and
 * canvas.templates.preview are no longer used. The region layer holds `_placementContext` for the
 * whole placement, and the context's preview Region joins `canvas.regions.preview` on the first
 * pointer move. Both must hold:
 *  - a GM drag-drawing a region also fills the preview container, but has no placement context;
 *  - on cancel the preview is destroyed (childRemoved fires) while the context is still set, and on
 *    confirm the context is cleared before placeRegions destroys the previews.
 * @param {ArrayLike<object>|null|undefined} children  canvas.regions.preview.children
 * @param {object|null|undefined} placing  canvas.regions._placementContext?.preview
 * @returns {boolean}
 */
export function placementActive(children, placing) {
  if (!placing || !children) return false;
  return Array.prototype.includes.call(children, placing);
}

/** Does this tool change the active tool when pressed (so the cursor may change)? */
export function isModalTool(tool) {
  return !!tool && typeof tool === "object" && !tool.toggle && !tool.button;
}

/** The four canvas cursor variables this module overrides. grab/grabbing/text stay Foundry's. */
export const VARS = Object.freeze(["--cursor-default", "--cursor-default-down", "--cursor-pointer", "--cursor-pointer-down"]);

/**
 * The CSS values for a key's four cursor variables.
 *
 * Set inline on #board (not in a stylesheet): a url() inside a custom property resolves against
 * the base URL where var() is substituted — here Foundry's inline style on #board, i.e. the page —
 * so the URL must already be absolute. `base` is the routed module folder,
 * e.g. getRoute("modules/pentaryn-cursors") → "/modules/pentaryn-cursors" (or "/<prefix>/modules/…").
 * @param {string} key
 * @param {string} base
 * @param {boolean} [imageSet]  use image-set() 1x/2x (only where CSS.supports it in `cursor`)
 * @returns {Record<string,string>|null}
 */
export function cursorValues(key, base, imageSet = false) {
  const k = KEYS[key];
  if (!k) return null;
  const root = String(base ?? "").replace(/\/+$/, "");
  const img = (suffix) => {
    const one = `url("${root}/assets/cursors/${key}${suffix}.png")`;
    const pic = imageSet ? `image-set(${one} 1x, url("${root}/assets/cursors/${key}${suffix}@2x.png") 2x)` : one;
    return `${pic} ${k.hotspot[0]} ${k.hotspot[1]}, ${k.fallback}`;
  };
  const normal = img(""), lit = img("-pointer");
  return { "--cursor-default": normal, "--cursor-default-down": normal, "--cursor-pointer": lit, "--cursor-pointer-down": lit };
}
