/**
 * Wall autocomplete — settings and keybindings. The only file outside lib/ that calls
 * game.settings.register/get.
 *
 * The labels are full-key literals into lang/en.json (`PENTARYN_WALLS.*`), switched together with
 * module.json `languages` in the Wave 7 batch (guide step 10, -36; W2-WALLS-1, Joe 2026-10-12).
 * Foundry localizes them when it draws the settings and controls screens.
 */

import { I18N, MODULE } from "./walls-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "backend", scope: "world", config: true, type: String, default: "auto",
    name: "PENTARYN_WALLS.settings.backend.name",
    hint: "PENTARYN_WALLS.settings.backend.hint",
    choices: {
      auto: "PENTARYN_WALLS.settings.backend.choices.auto",
      wasm: "PENTARYN_WALLS.settings.backend.choices.wasm",
      js: "PENTARYN_WALLS.settings.backend.choices.js",
    },
    doc: "Which engine runs: auto (wasm when loaded, else js), wasm, or js. Read on every run.",
  },
]);

/**
 * Keybindings register at `init` only (Foundry throws after setup). `action` names the API action
 * the key runs; `registerSettings` binds it through `onKey(action)`.
 */
export const KEYBINDINGS = Object.freeze([
  {
    key: "run", action: "run",
    name: "PENTARYN_WALLS.keys.run.name",
    hint: "PENTARYN_WALLS.keys.run.hint",
    editable: [{ key: "KeyW", modifiers: ["Alt"] }],
    restricted: true,
    doc: "Alt+W: run on the current scene (GM only).",
  },
  {
    key: "undo", action: "undo",
    name: "PENTARYN_WALLS.keys.undo.name",
    hint: "PENTARYN_WALLS.keys.undo.hint",
    editable: [{ key: "KeyZ", modifiers: ["Alt"] }],
    restricted: true,
    doc: "Alt+Z: undo the latest run on the current scene (GM only).",
  },
  {
    key: "preview", action: "preview",
    name: "PENTARYN_WALLS.keys.preview.name",
    hint: "PENTARYN_WALLS.keys.preview.hint",
    editable: [{ key: "KeyW", modifiers: ["Alt", "Shift"] }],
    restricted: true,
    doc: "Alt+Shift+W: preview on the current scene (GM only).",
  },
]);

/**
 * Called from the entry's `init` handler. `onKey(action)` returns the keybinding's `onDown`.
 * Both kit calls skip what is already registered.
 */
export function registerSettings({ log, onKey } = {}) {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N });
  const rows = KEYBINDINGS.map(({ action, editable, ...row }) => ({
    ...row,
    editable: editable.map(b => ({ ...b, modifiers: [...b.modifiers] })),
    onDown: onKey(action),
  }));
  defineKeybindings(MODULE, rows, { i18nRoot: I18N, log });
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
