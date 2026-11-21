/**
 * Pentaryn Dice — settings and keybindings. The only file outside lib/ that calls game.settings.
 *
 * Rows carry LITERAL `name` and `hint` keys so the i18n gate sees a definite reference.
 */

import { DEFAULT_SELECT_KEY, I18N, MODULE } from "./dice-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "enabled", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_DICE.Setting.enabled.Name",
    hint: "PENTARYN_DICE.Setting.enabled.Hint",
    doc: "Per browser: the count boxes, the select buttons and the hint line in Dice So Nice's sidebar "
      + "tab, and the select-all shortcut. Read live; the tab redraws on change, so no reload.",
  },
]);

/** `onDown` is filled in by the entry (settings.mjs must not import a feature). */
export const KEYBINDINGS = Object.freeze([
  {
    key: "selectAll",
    name: "PENTARYN_DICE.Keybind.selectAll.Name",
    hint: "PENTARYN_DICE.Keybind.selectAll.Hint",
    editable: [{ key: DEFAULT_SELECT_KEY.key, modifiers: [...DEFAULT_SELECT_KEY.modifiers] }],
    doc: "Select all of your own persistent dice. Not Ctrl+A (core's select-all tokens). Passes the key "
      + "on (returns false) when you have no dice on the table.",
  },
]);

/**
 * Called from the entry's `init` handler (and again by a hot patch; the kit skips rows that exist).
 * `onChange` is the feature's reaction to `enabled`; `onSelectAll` the shortcut's handler.
 */
export function registerSettings({ log, onChange, onSelectAll } = {}) {
  const rows = SETTINGS.map(row => (row.key === "enabled" && onChange ? { ...row, onChange } : row));
  defineSettings(MODULE, rows, { i18nRoot: I18N, log });
  const binds = KEYBINDINGS.map(row => (row.key === "selectAll" && onSelectAll
    ? { ...row, onDown: onSelectAll, precedence: globalThis.CONST?.KEYBINDING_PRECEDENCE?.NORMAL ?? 1 }
    : row));
  defineKeybindings(MODULE, binds, { i18nRoot: I18N, log });
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}

/** The first binding of the select-all action, as Foundry holds it now (the player may have rebound it). */
export function selectAllBinding({ g = globalThis } = {}) {
  try {
    return g.game?.keybindings?.get?.(MODULE, "selectAll")?.[0] ?? null;
  } catch {
    return null;   // not registered yet (before init) — the hint falls back to the default
  }
}
