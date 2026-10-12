/**
 * Pentaryn Tool Cursors — FEATURE: the canvas glue. Sets the four --cursor-* variables inline on
 * #board for the active control/tool, repairs a blanked board cursor, and watches the spell-area
 * preview. Purely per-client: no documents, no sockets, no GM relay.
 *
 * Foundry draws the canvas cursor as #board.style.cursor = "var(--cursor-default)" (pointer, -down…),
 * with the variables on :root (Game#configureCursors). Setting those variables inline on #board
 * changes the map's cursor and nothing else in the UI. Select stays the system arrow; every other
 * tool in KEYS gets its coloured glyph.
 *
 * Core internals read or written here (adjustments row core-board-cursor-vars):
 * renderer.events.currentCursor / setCursor (resync), canvas.regions._placementContext
 * (previewActive), and the scene control/tool onChange wrap (wrapOnChange).
 */

import { MODULE, VARS, cursorValues, isModalTool, keyFor, placementActive, probeInternals } from "./cursors-core.mjs";
import { setting } from "./settings.mjs";

const WRAPPED = Symbol.for(`${MODULE}.wrapped`);
let current = null;
let imageSet = null;
/** ctx.log of the entry that installed this feature (kept after uninstall: wrapped onChanges still refresh). */
let log = null;

function enabled() {
  return setting("enabled") !== false;
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
export function resync(el = boardEl()) {
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
    try { resync(el); } catch (err) { log.warn("resync failed", err); }
  }).observe(el, { attributes: true, attributeFilter: ["style"] });
}

/**
 * Is a spell-area placement following the mouse? (dnd5e 6: core RegionLayer#placeRegions; see placementActive.)
 * pentaryn-aoe reads the same `_placementContext` to ask "can it be cancelled?" (core.placementInProgress).
 * `_placementContext` is listed in two adjustments rows: core-board-cursor-vars (this module) and
 * core-region-placement-escape (shared with pentaryn-aoe's placementInProgress); keep the two readers separate.
 */
function previewActive() {
  const layer = canvas?.regions;
  return placementActive(layer?.preview?.children, layer?._placementContext?.preview);
}

/** refresh(), with a throw logged as `refresh failed` (listeners and wrapped onChanges). */
function refreshLogged() {
  try { refresh(); } catch (err) { log.warn("refresh failed", err); }
}

const watched = new WeakSet();
/** Refresh when a preview is added to or removed from the region layer (the container is rebuilt per draw). */
function watchPreview() {
  const preview = canvas?.regions?.preview;
  if (!preview?.on || watched.has(preview)) return;
  watched.add(preview);
  const onChange = () => refreshLogged();
  preview.on("childAdded", onChange);
  preview.on("childRemoved", onChange);
}

/** Recompute the cursor for the current control, tool and layer. Returns the key or null. */
export function refresh() {
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
    finally { refreshLogged(); }
  };
  wrapped[WRAPPED] = true;
  obj.onChange = wrapped;
}

/** Guard the board, watch the preview container, refresh (the shared half of canvasReady and ready). */
function attach() {
  guardBoard();
  watchPreview();
  refresh();
}

/** What api.status() reports (statusOf in core shapes it). Reads only: no style write. */
function snapshot() {
  const el = boardEl();
  return {
    enabled: enabled(),
    control: ui.controls?.control?.name ?? null,
    tool: ui.controls?.tool?.name ?? null,
    placementActive: !!canvas?.ready && previewActive(),
    boardCursor: el?.style?.cursor ?? null,
    dataset: el?.dataset?.pentarynCursor ?? null,
    imageSet: useImageSet(),
  };
}

/**
 * Warn once per page when a core internal this file relies on is gone (finding -30): without
 * setCursor a blanked cursor is never repaired, without _placementContext the spell-area glyph
 * never shows. Both fail silently otherwise.
 */
function checkInternals() {
  const missing = probeInternals({ events: canvas?.app?.renderer?.events, regions: canvas?.regions });
  if (missing.length) {
    log.warnOnce("internals", `core internals missing: ${missing.join(", ")} — see adjustments row core-board-cursor-vars`);
  }
}

/** The setting's onChange: refresh, then repair a blanked cursor. */
export function onEnabledChange() {
  refresh();
  resync();
}

/** Clear the board's cursor variables and forget the current cursor. */
function clear() {
  const el = boardEl();
  if (el) apply(el, null);
  current = null;
}

export function install(reg, ctx) {
  log = ctx.log;
  ctx.expose({ refresh, current: () => current, snapshot });

  // Raw handlers (guard: false): a throw stays Foundry's `Error thrown in hooked function` report.
  reg.on("getSceneControlButtons", (controls) => {
    for (const control of Object.values(controls ?? {})) {
      if (!control || typeof control !== "object") continue;
      wrapOnChange(control);
      for (const tool of Object.values(control.tools ?? {})) if (isModalTool(tool)) wrapOnChange(tool);
    }
  }, { guard: false, label: "getSceneControlButtons: wrap onChange" });
  reg.on("renderSceneControls", () => refresh(), { guard: false, label: "renderSceneControls: refresh" });
  // dnd5e 6 places a spell area with core RegionLayer#placeRegions: it activates the token or region
  // layer, then the preview Region joins canvas.regions.preview on the first pointer move (watchPreview);
  // the preview leaves the container when the placement is confirmed or cancelled.
  reg.on("activateCanvasLayer", () => refresh(), { guard: false, label: "activateCanvasLayer: refresh" });
  // canvasReady: other modules' canvasReady handlers may blank the cursor (see resync), possibly before
  // this one runs, so also resync a tick later.
  reg.on("canvasReady", () => {
    attach();
    checkInternals();
    setTimeout(() => resync(), 0);
  }, { guard: false, label: "canvasReady: attach" });
  reg.on("canvasTearDown", () => clear(), { guard: false, label: "canvasTearDown: clear" });

  const ready = () => setTimeout(() => { attach(); resync(); }, 0);
  if (globalThis.game?.ready) ready();   // hot patch: ready has already fired
  else reg.once("ready", ready, { guard: false, label: "ready: attach" });
}

/** Clear the board; the hooks go with the entry's reg.offAll(). Wrapped onChanges stay (they only refresh). */
export function uninstall() {
  clear();
}
