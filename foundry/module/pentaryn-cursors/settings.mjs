/**
 * Pentaryn Tool Cursors — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * The row carries the LITERAL `name` and `hint` keys it has always had, so lang/en.json keeps its
 * strings and the i18n gate sees a definite reference.
 */

import { I18N, MODULE } from "./cursors-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "enabled", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_CURSORS.Setting.enabled.Name",
    hint: "PENTARYN_CURSORS.Setting.enabled.Hint",
    doc: "Per browser: show the active scene tool on the map's mouse pointer. Off → Foundry's own "
      + "cursors, and a blanked #board cursor is no longer repaired. Read live, so no reload.",
  },
]);

export const KEYBINDINGS = Object.freeze([]);

/**
 * Called from the entry's `init` handler (and again by a hot patch; the kit skips rows that exist).
 * `onChange` is the feature's reaction to the `enabled` row. The entry passes it in, because
 * settings.mjs must not import a feature.
 */
export function registerSettings({ log, onChange } = {}) {
  const rows = SETTINGS.map(row => (row.key === "enabled" && onChange ? { ...row, onChange } : row));
  defineSettings(MODULE, rows, { i18nRoot: I18N });
  defineKeybindings(MODULE, KEYBINDINGS, { i18nRoot: I18N, log });
}

/** The live value; the row default (true) when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
