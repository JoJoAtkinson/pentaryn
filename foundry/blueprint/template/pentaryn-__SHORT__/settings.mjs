/**
 * __Title__ — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Every row carries LITERAL `name` and `hint` keys: the i18n gate sees a literal as a definite
 * reference, so a missing lang key fails the gate instead of showing a raw key in the menu.
 */

import { I18N, MODULE } from "./__SHORT__-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "enabled", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN___SHORT_UPPER__.Setting.enabled.Name",
    hint: "PENTARYN___SHORT_UPPER__.Setting.enabled.Hint",
    doc: "Master switch for the example feature: when off, note changes are not tracked or announced.",
  },
]);

// EXAMPLE: one keybinding row (GM-only, unbound by default). Replace or delete it with the example
// feature; an empty table is `Object.freeze([])`. Keybindings register at `init` only — Foundry
// throws after `setup` — so a hot patch never adds a new row: a new or changed row needs a reload.
export const KEYBINDINGS = Object.freeze([
  {
    key: "toggleEnabled", editable: [], restricted: true,
    name: "PENTARYN___SHORT_UPPER__.Keybind.toggleEnabled.Name",
    hint: "PENTARYN___SHORT_UPPER__.Keybind.toggleEnabled.Hint",
    onDown: () => {
      game.settings.set(MODULE, "enabled", !setting("enabled"))
        .catch(err => console.error(`${MODULE} | keybinding toggleEnabled`, err));
      return true;
    },
    doc: "Flip the enabled switch (GM only; no default key — bind it in Configure Controls).",
  },
]);

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
