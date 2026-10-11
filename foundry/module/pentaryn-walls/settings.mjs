/**
 * Wall autocomplete — settings and keybindings. The only file outside lib/ that calls
 * game.settings.register/get.
 *
 * The labels are LITERAL ENGLISH, byte-identical to the registrations they replace: the module has
 * no `languages` entry yet, so a key would show raw. They become `PENTARYN_WALLS.*` keys together
 * with module.json `languages` (the Wave 7 batch, guide step 10; C51 fails until then).
 */

import { I18N, MODULE } from "./walls-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "backend", scope: "world", config: true, type: String, default: "auto",
    name: "Engine backend",
    hint: "Automatic uses the compiled (WASM) engine when it loads, falling back to JavaScript. " +
          "Both produce identical geometry — verified against the same 44 fixtures — so this " +
          "only affects speed. Compiled is ~12x faster on large scenes.",
    choices: { auto: "Automatic (compiled when available)", wasm: "Compiled (WASM)", js: "JavaScript" },
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
    name: "Wall autocomplete: run",
    hint: "Complete the walls on the current scene. Reversible — undo removes exactly this run.",
    editable: [{ key: "KeyW", modifiers: ["Alt"] }],
    restricted: true,
    doc: "Alt+W: run on the current scene (GM only).",
  },
  {
    key: "undo", action: "undo",
    name: "Wall autocomplete: undo last run",
    hint: "Remove the walls the last run created and restore any it trimmed. Press again to peel back the run before it.",
    editable: [{ key: "KeyZ", modifiers: ["Alt"] }],
    restricted: true,
    doc: "Alt+Z: undo the latest run on the current scene (GM only).",
  },
  {
    key: "preview", action: "preview",
    name: "Wall autocomplete: preview",
    hint: "Report what would be built without writing anything.",
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
