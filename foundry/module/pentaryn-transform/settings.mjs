/**
 * Pentaryn Transform — settings. The only file outside lib/ that reads game.settings or registers a
 * keybinding. The module has no world settings of its own: one keybinding (Escape) and one read of
 * dnd5e's.
 *
 * Every row carries LITERAL `name` and `hint` keys (C51): the i18n gate sees them.
 */

import { MODULE } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

const log = makeLog(MODULE);

/** No world or client settings. */
export const SETTINGS = Object.freeze([]);

/**
 * Escape cancels Argon's target picker, else closes an open Wild Shape / Starry Form picker (PT3-6).
 * `onDown` is bound at install by hud-panels (it calls argon.mjs, which this file may not import);
 * the precedence is CONST.KEYBINDING_PRECEDENCE.PRIORITY, read at `init` when CONST exists.
 */
export const KEYBINDINGS = Object.freeze([
  Object.freeze({
    key: "cancelTargetPicker",
    name: "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Name",
    hint: "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Hint",
    editable: [{ key: "Escape" }],
    doc: "Escape: cancel the HUD's target picker, else close an open Wild Shape / Starry Form picker; nothing open → core's Escape."
  })
]);

/**
 * Register the keybindings at `init`. Foundry refuses a keybinding after `init` (it throws); that is
 * caught and warned with the fixed text, and loading goes on.
 * @param {{ onDown: () => boolean }} handlers
 */
export function registerKeybindings({ onDown }) {
  try {
    for (const { key, doc: _doc, ...row } of KEYBINDINGS) {
      game.keybindings.register(MODULE, key, { ...row, onDown, precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY });
    }
  } catch (err) {
    log.warn("Escape-cancels-target-picker keybinding not registered", err);
  }
}

/** dnd5e's "Allow Polymorphing" world setting (players may transform). */
export function dnd5eAllowsPolymorphing() {
  return game.settings.get("dnd5e", "allowPolymorphing");
}

/** The live value; the row default when unregistered or unreadable (no rows today). */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
