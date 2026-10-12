/**
 * Pentaryn Feedback — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Every row carries LITERAL `name` and `hint` keys: the i18n gate sees a literal as a definite
 * reference, so a missing lang key fails the gate instead of showing a raw key in the menu.
 *
 * No store rows: reports are files under Data/, never world settings (blueprint §5.3), and the
 * offline queue is a flag on the reporter's own User document.
 */

import { I18N, LIMITS, MODULE } from "./feedback-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "historySize", scope: "world", config: true, type: Number, default: LIMITS.actionsDefault,
    range: { min: LIMITS.actionsMin, max: LIMITS.actionsMax, step: 10 },
    name: "PENTARYN_FEEDBACK.Setting.historySize.Name",
    hint: "PENTARYN_FEEDBACK.Setting.historySize.Hint",
    doc: "Recent actions each client keeps for its next report. Read on every push (live, no reload); clamped 20..1000.",
  },
  {
    key: "captureConsole", scope: "world", config: true, type: Boolean, default: true,
    requiresReload: true,
    name: "PENTARYN_FEEDBACK.Setting.captureConsole.Name",
    hint: "PENTARYN_FEEDBACK.Setting.captureConsole.Hint",
    doc: "Record console.error / console.warn lines into the report's error list. The wrap installs at setup, so a change needs a reload.",
  },
]);

/** No keybindings: the toolbar button, `/bug` and the API are the doors. */
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
