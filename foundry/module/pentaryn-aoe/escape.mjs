/**
 * Part E — Escape cancels a dnd5e area template placement, the same way right-click does.
 *
 * dnd5e 5.3.3 AbilityTemplate#activatePreviewListeners only binds right-click
 * (canvas.app.view.oncontextmenu → _onCancelPlacement). Escape fell through to core's "dismiss"
 * (DEFERRED precedence), which closed windows or opened the main menu while the preview kept
 * following the mouse. This binding runs at PRIORITY precedence and only consumes the key while
 * a template is being placed; then it calls the template's own _onCancelPlacement, so the preview
 * is cleared, the earlier layer re-activated, the sheet restored and the placement promise
 * rejected exactly as for right-click. Otherwise it returns false and core handles Escape.
 *
 * Keybindings can only be registered during init. A hot-patched copy cannot add one, but when the
 * module loaded at startup it takes over the binding registered then (see SLOT); on a first install
 * that is hot-patched there is no binding, it says so in the console and everything else installs.
 */

import { MODULE, placingTemplate } from "./core.mjs";

/**
 * The handler slot the registered binding calls through. Foundry copies a binding's onDown into
 * its key map at init and never lets it be re-registered, so the function registered then is a
 * trampoline into this slot, and whichever copy installed last (a hot-patched copy after
 * uninstall() of the startup one, say) puts its own handler here. Empty slot = core Escape.
 */
const SLOT = Symbol.for(`${MODULE}.cancelTemplate`);

/** The template being placed right now, if any. */
export function activePlacement() {
  return placingTemplate(globalThis.canvas?.templates?.preview?.children);
}

/** Synchronous on purpose: an async onDown returns a Promise, which always counts as consumed. */
function onEscape(context) {
  const template = activePlacement();
  if (!template) return false;
  try {
    const out = template._onCancelPlacement(context?.event);
    if (out instanceof Promise) out.catch(err => console.error(`${MODULE} | cancel placement`, err));
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
    console.warn(`${MODULE} | Escape-cancels-template keybinding not registered (registered after init?)`, err);
  }
}

/** Uninstall cannot remove a keybinding, so it empties the slot (only if it is still this copy's). */
export function disableEscape() {
  if (globalThis[SLOT] === onEscape) delete globalThis[SLOT];
}
