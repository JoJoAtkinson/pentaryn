/**
 * Pentaryn Senses — settings. The only file outside lib/ that calls game.settings.register/get/set.
 *
 * One row today, a store row: `sightReset` is the one-shot marker of the darkvision reset
 * (migrate.mjs). A store row registers `{scope: "world", config: false, type, default}` with no
 * labels — byte-identical to the registration it replaces — so it needs no lang keys (C51 skips
 * store rows). It is written once by the active GM, so it does not go through serialStore.
 */

import { I18N, MODULE } from "./senses-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "sightReset", store: true, type: Number, default: 0,
    doc: "one-shot marker: 1 once the retired 0.3 darkvision sight was reset (dnd5e-sense-vision-reset)",
  },
]);

/** Called from the entry's `init` handler. Rows already registered (a hot re-import) are skipped. */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N });
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

/** Write one of this module's settings (a world setting: a Setting document write, after ready). */
export function setSetting(key, value) {
  return game.settings.set(MODULE, key, value);
}

/** Another package's setting, or `undefined` when it is not registered (e.g. dnd5e's senseVisionSync on 5.x). */
export function systemSetting(namespace, key) {
  try {
    return game.settings.get(namespace, key);
  } catch {
    return undefined;
  }
}

/** The chat mode the user picked (core's rollMode), for clients without ChatMessage.applyMode. */
export function coreRollMode() {
  return game.settings.get("core", "rollMode");
}

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
