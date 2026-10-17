/**
 * Pentaryn Pins — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Every row carries LITERAL `name` and `hint` keys: the i18n gate sees a literal as a definite
 * reference, so a missing lang key fails the gate instead of showing a raw key in the menu.
 *
 * `pinning` is read live through `setting("pinning")` everywhere, the patches included, so it
 * applies without a reload. Its onChange fans out to whatever the features subscribed with
 * `onPinningChange` (core calls a world setting's onChange as `(value, options, userId)` on every
 * client, client/documents/setting.mjs:51; the kit passes it through).
 */

import { I18N, MODULE } from "./pins-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** Subscribers to the switch: `(value, options, userId) => void`. */
const pinningListeners = new Set();

/** Subscribe to `pinning` changes; returns the unsubscribe function (call it in uninstall). */
export function onPinningChange(fn) {
  pinningListeners.add(fn);
  return () => pinningListeners.delete(fn);
}

function pinningChanged(value, options, userId) {
  for (const fn of [...pinningListeners]) {
    try {
      fn(value, options, userId);
    } catch (err) {
      console.error(`${MODULE} | pinning onChange`, err);
    }
  }
}

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "pinning", scope: "world", config: true, type: Boolean, default: false, requiresReload: false,
    onChange: pinningChanged,
    name: "PENTARYN_PINS.Setting.pinning.Name",
    hint: "PENTARYN_PINS.Setting.pinning.Hint",
    doc: "The world switch. On: a pinned player sees the scene their pinned token is on and ignores GM activation and pulls; "
      + "the sheet shows 'Pinned to'; the GM gets the right-click canvas menu. Off: everything in pins is inert.",
  },
]);

/** No keybindings: the menu is a right-click, and P stays pentaryn-prompts'. */
export const KEYBINDINGS = Object.freeze([]);

/** Called from the entry's `init` handler, and again by a hot patch (both kit calls skip what exists). */
export function registerSettings({ log } = {}) {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N });
  defineKeybindings(MODULE, KEYBINDINGS, { i18nRoot: I18N, log });
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
