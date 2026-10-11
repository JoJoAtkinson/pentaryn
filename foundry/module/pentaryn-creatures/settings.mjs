/**
 * Pentaryn Creatures — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Four rows, in the order they have always been registered. Every row carries full literal label
 * keys (`PENTARYN_CREATURES.settings.<key>.name/hint`), so the i18n gate proves each one. A row's
 * onChange calls whatever a feature registered for that key with onSettingChange(); the features do
 * that during their synchronous install, before `init`. Every read is live through setting(), so
 * no row needs a reload.
 */

import { MODULE } from "./creatures-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** key → the feature's change handler. */
const handlers = {};

/** Route a setting's onChange to `fn` (one handler per key; a later call replaces it). */
export function onSettingChange(key, fn) {
  handlers[key] = fn;
}

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "lightRadius", scope: "world", config: true, type: Number, default: 5,
    name: "PENTARYN_CREATURES.settings.lightRadius.name",
    hint: "PENTARYN_CREATURES.settings.lightRadius.hint",
    range: { min: 0, max: 30, step: 0.5 },
    onChange: value => handlers.lightRadius?.(value),
    doc: "Bright = dim radius (ft) of the light on every player-owned creature token; 0 removes every light we added. "
      + "The active GM's client rewrites the lights when it changes.",
  },
  {
    key: "ownerSees", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.ownerSees.name",
    hint: "PENTARYN_CREATURES.settings.ownerSees.hint",
    onChange: value => handlers.ownerSees?.(value),
    doc: "A player always sees the tokens they own (never GM-hidden ones); anything but false is on.",
  },
  {
    key: "floatOverHud", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.floatOverHud.name",
    hint: "PENTARYN_CREATURES.settings.floatOverHud.hint",
    doc: "The strip floats just above Argon's Combat HUD while it is open, instead of behind it.",
  },
  {
    key: "showStrip", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.showStrip.name",
    hint: "PENTARYN_CREATURES.settings.showStrip.hint",
    onChange: value => handlers.showStrip?.(value),
    doc: "This client draws the \"Your creatures\" strip (players only, from two owned tokens on the scene). Client scope.",
  },
]);

/** Called from the entry's `init` handler (rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS);
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
