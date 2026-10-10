/**
 * Part E — Escape cancels a spell-area placement on the FIRST press, even with a window open.
 *
 * dnd5e 6 places every activity area through core's RegionLayer#placeRegions
 * (TemplatePlacement#_place). Core's own Escape ("dismiss", DEFERRED precedence) does reach the
 * placement — but only at its step 5 (`canvas.activeLayer._onDismissKey`), after step 4 has closed
 * every open window. dnd5e's BasePlacement#place minimises every framed window for the placement,
 * starting with the sheet the spell was cast from, so the first Escape CLOSES that sheet while the
 * preview keeps following the mouse — the 2026-10-08 table complaint Part E was written for. Only
 * a cast from the Argon HUD with no window open cancels on the first press natively.
 *
 * This binding runs at PRIORITY precedence and consumes Escape only while canvas.regions has a
 * placement in progress, cancelling it exactly as core's dismiss would (RegionLayer#_cancelPlacement
 * resolves the placement with null; dnd5e then restores the layer and the windows). At any other
 * time it returns false and core handles Escape. Adjustment row core-region-placement-escape.
 *
 * Keybindings can only be registered during init. A hot-patched copy cannot add one, but when the
 * module loaded at startup it takes over the binding registered then (see SLOT).
 */

import { MODULE, placementInProgress } from "./core.mjs";

/**
 * The handler slot the registered binding calls through. Foundry copies a binding's onDown into
 * its key map at init and never lets it be re-registered, so the function registered then is a
 * trampoline into this slot; whichever copy installed last puts its own handler here.
 * Empty slot = core Escape.
 */
const SLOT = Symbol.for(`${MODULE}.cancelTemplate`);

/** The region placement in progress right now (core's placement context), or null. */
export function activePlacement() {
  const layer = globalThis.canvas?.regions;
  return placementInProgress(layer) ? layer._placementContext : null;
}

/** Synchronous on purpose: an async onDown returns a Promise, which always counts as consumed. */
function onEscape() {
  const layer = globalThis.canvas?.regions;
  if (!placementInProgress(layer)) return false;
  try {
    layer._cancelPlacement();
  } catch (err) {
    console.error(`${MODULE} | cancel placement`, err);
  }
  return true;
}

/** What Foundry actually calls: whatever handler is in the slot now. */
function trampoline(context) {
  const handler = globalThis[SLOT];
  return typeof handler === "function" ? handler(context) === true : false;
}

export function registerEscape() {
  globalThis[SLOT] = onEscape;
  if (game.keybindings.actions?.has(`${MODULE}.cancelTemplate`)) return;
  try {
    game.keybindings.register(MODULE, "cancelTemplate", {
      name: "PENTARYN_AOE.Keybinding.cancelTemplate.Name",
      hint: "PENTARYN_AOE.Keybinding.cancelTemplate.Hint",
      editable: [{ key: "Escape" }],
      onDown: trampoline,
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY
    });
  } catch (err) {
    console.warn(`${MODULE} | Escape-cancels-placement keybinding not registered (registered after init?)`, err);
  }
}

/** Uninstall cannot remove a keybinding, so it empties the slot (only if it is still this copy's). */
export function disableEscape() {
  if (globalThis[SLOT] === onEscape) delete globalThis[SLOT];
}
