// Pentaryn Tool Cursors — the mouse pointer on the map shows which scene tool is active.
//
// Foundry draws the canvas cursor as #board.style.cursor = "var(--cursor-default)" (pointer, -down…),
// with the variables on :root (Game#configureCursors). Setting those variables inline on #board
// changes the map's cursor and nothing else in the UI. Select stays the system arrow; every other
// tool in KEYS gets its coloured glyph. Purely per-client: no documents, no sockets, no GM relay.

import { MODULE, KEYS, VARS, keyFor, isModalTool, cursorValues, placementActive } from "./cursors-core.mjs";

const WRAPPED = Symbol.for(`${MODULE}.wrapped`);
let current = null;
let imageSet = null;

function enabled() {
  try { return game.settings.get(MODULE, "enabled") !== false; } catch { return true; }
}

/** image-set() in `cursor` is uneven across browsers; use it only where the engine accepts it. */
function useImageSet() {
  if (imageSet === null) {
    try { imageSet = !!globalThis.CSS?.supports?.("cursor", 'image-set(url("x.png") 1x) 0 0, auto'); }
    catch { imageSet = false; }
  }
  return imageSet;
}

/** The element PIXI writes style.cursor to (the #board canvas). */
function boardEl() {
  return canvas?.app?.renderer?.events?.domElement ?? canvas?.app?.view ?? null;
}

function apply(el, key) {
  if (key === current && (el.dataset.pentarynCursor ?? null) === key) return;
  for (const v of VARS) el.style.removeProperty(v);
  const values = key ? cursorValues(key, foundry.utils.getRoute(`modules/${MODULE}`), useImageSet()) : null;
  if (values) {
    for (const [k, v] of Object.entries(values)) el.style.setProperty(k, v);
    el.dataset.pentarynCursor = key;
  } else delete el.dataset.pentarynCursor;
  current = values ? key : null;
}

/**
 * Put Foundry's own cursor back if another script blanked #board.style.cursor.
 *
 * Foundry's setCursor only writes when its mode changes (events.currentCursor), so once something
 * sets style.cursor = "" the map shows the system arrow, and none of these variables, until the
 * mode next changes. Monk's Active Tiles does exactly that on every canvasReady and on hover-out of a
 * pointer tile ($("#board").css({cursor: ""})). Re-issuing the current mode restores whatever
 * Foundry meant — the tool glyph, its pointer variant, or Foundry's hands.
 */
function resync(el = boardEl()) {
  const events = canvas?.app?.renderer?.events;
  if (!el || !events || el.style.cursor || !enabled()) return;
  const mode = events.currentCursor;
  if (!mode || typeof events.setCursor !== "function") return;
  events.currentCursor = null;
  events.setCursor(mode);
}

const guarded = new WeakSet();
/** Watch #board's style attribute and resync() whenever its cursor is blanked. */
function guardBoard() {
  const el = boardEl();
  if (!el || guarded.has(el) || typeof MutationObserver !== "function") return;
  guarded.add(el);
  new MutationObserver(() => {
    try { resync(el); } catch (err) { console.warn(`${MODULE} | resync failed`, err); }
  }).observe(el, { attributes: true, attributeFilter: ["style"] });
}

/** Is a spell-area placement following the mouse? (dnd5e 6: core RegionLayer#placeRegions; see placementActive.) */
function previewActive() {
  const layer = canvas?.regions;
  return placementActive(layer?.preview?.children, layer?._placementContext?.preview);
}

const watched = new WeakSet();
/** Refresh when a preview is added to or removed from the region layer (the container is rebuilt per draw). */
function watchPreview() {
  const preview = canvas?.regions?.preview;
  if (!preview?.on || watched.has(preview)) return;
  watched.add(preview);
  const onChange = () => { try { refresh(); } catch (err) { console.warn(`${MODULE} | refresh failed`, err); } };
  preview.on("childAdded", onChange);
  preview.on("childRemoved", onChange);
}

/** Recompute the cursor for the current control, tool and layer. Returns the key or null. */
function refresh() {
  const el = boardEl();
  if (!el) { current = null; return null; }
  const templatesActive = !!canvas?.ready && previewActive();
  const key = enabled() && canvas?.ready
    ? keyFor({ control: ui.controls?.control?.name, tool: ui.controls?.tool?.name, templatesActive })
    : null;
  apply(el, key);
  return current;
}

/** Call refresh() after a control's or tool's own onChange (a tool-only change does not re-render). */
function wrapOnChange(obj) {
  const original = obj.onChange;
  if (original?.[WRAPPED]) return;
  const wrapped = function (...args) {
    try { return original?.apply(this, args); }
    finally { try { refresh(); } catch (err) { console.warn(`${MODULE} | refresh failed`, err); } }
  };
  wrapped[WRAPPED] = true;
  obj.onChange = wrapped;
}

Hooks.once("init", () => {
  game.settings.register(MODULE, "enabled", {
    name: "PENTARYN_CURSORS.Setting.enabled.Name",
    hint: "PENTARYN_CURSORS.Setting.enabled.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => { refresh(); resync(); }
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  for (const control of Object.values(controls ?? {})) {
    if (!control || typeof control !== "object") continue;
    wrapOnChange(control);
    for (const tool of Object.values(control.tools ?? {})) if (isModalTool(tool)) wrapOnChange(tool);
  }
});
Hooks.on("renderSceneControls", () => refresh());
// dnd5e 6 places a spell area with core RegionLayer#placeRegions: it activates the token or region
// layer, then the preview Region joins canvas.regions.preview on the first pointer move (watchPreview);
// the preview leaves the container when the placement is confirmed or cancelled.
Hooks.on("activateCanvasLayer", () => refresh());
// canvasReady: other modules' canvasReady handlers may blank the cursor (see resync), possibly before
// this one runs, so also resync a tick later.
Hooks.on("canvasReady", () => {
  guardBoard();
  watchPreview();
  refresh();
  setTimeout(() => resync(), 0);
});
Hooks.on("canvasTearDown", () => {
  const el = boardEl();
  if (el) apply(el, null);
  current = null;
});

Hooks.once("ready", () => setTimeout(() => {
  const api = { refresh, current: () => current, keys: KEYS, keyFor };
  const existing = game.pentaryn;
  if (existing && !Object.isExtensible(existing)) game.pentaryn = { ...existing, cursors: api };
  else { game.pentaryn ??= {}; game.pentaryn.cursors = api; }
  guardBoard();
  watchPreview();
  refresh();
  resync();
}, 0));
