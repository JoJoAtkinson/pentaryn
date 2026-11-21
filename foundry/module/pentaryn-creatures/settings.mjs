/**
 * Pentaryn Creatures — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * The rows, in the order they have always been registered (new rows go last), and the Token markers
 * menu (registerMenu, GM only). Every config row carries full literal label
 * keys (`PENTARYN_CREATURES.settings.<key>.name/hint`), so the i18n gate proves each one. A row's
 * onChange calls whatever a feature registered for that key with onSettingChange(); the features do
 * that during their synchronous install, before `init`, and the entry's uninstall() clears them with
 * clearSettingHandlers() (creatures-edge-1). Every read is live through setting(), so
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

/** Forget every routed handler (the entry's uninstall; a re-import registers them again). */
export function clearSettingHandlers() {
  for (const key of Object.keys(handlers)) delete handlers[key];
}

/** A row's onChange: calls the handler registered for `key` at change time, if any. */
const routed = key => value => handlers[key]?.(value);

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "lightRadius", scope: "world", config: true, type: Number, default: 5,
    name: "PENTARYN_CREATURES.settings.lightRadius.name",
    hint: "PENTARYN_CREATURES.settings.lightRadius.hint",
    range: { min: 0, max: 30, step: 0.5 },
    onChange: routed("lightRadius"),
    doc: "Bright = dim radius (ft) of the light on every player-owned creature token; 0 removes every light we added. "
      + "The active GM's client rewrites the lights when it changes.",
  },
  {
    key: "ownerSees", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.ownerSees.name",
    hint: "PENTARYN_CREATURES.settings.ownerSees.hint",
    onChange: routed("ownerSees"),
    doc: "A player always sees the tokens they own (never GM-hidden ones); anything but false is on.",
  },
  {
    key: "floatOverHud", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.floatOverHud.name",
    hint: "PENTARYN_CREATURES.settings.floatOverHud.hint",
    onChange: routed("floatOverHud"),
    doc: "The strip floats just above Argon's Combat HUD while it is open, instead of behind it.",
  },
  {
    key: "showStrip", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.showStrip.name",
    hint: "PENTARYN_CREATURES.settings.showStrip.hint",
    onChange: routed("showStrip"),
    doc: "This client draws the \"Your creatures\" strip (players only, from two owned tokens on the scene). Client scope.",
  },
  {
    key: "summonLibrary", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.summonLibrary.name",
    hint: "PENTARYN_CREATURES.settings.summonLibrary.hint",
    onChange: routed("summonLibrary"),
    doc: "A player without Create New Actors who summons from a compendium gets a copy made by the active GM, owned by "
      + "them, in PC Summons & Forms/<First name> — summons & forms; dnd5e reuses it next time. Off: dnd5e's own refusal.",
  },
  {
    key: "markers", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_CREATURES.settings.markers.name",
    hint: "PENTARYN_CREATURES.settings.markers.hint",
    onChange: routed("markers"),
    doc: "Public and hidden markers: a player sees a status marker on a creature they do not observe only when its row in "
      + "the Token markers menu is Public; a dormant token shows none. Off: dnd5e's own rule (dnd5e.bloodied) only.",
  },
  {
    key: "markerTable", store: true, type: Object, default: {},
    onChange: routed("markerTable"),
    doc: "The Token markers menu's rows, overrides only: { statuses: { <status id>: \"public\"|\"gm\" }, other, friendlyAll }. "
      + "Edit it through the menu (Configure Settings → Pentaryn Creatures → Token markers).",
  },
]);

/** The Token markers menu: GM only, opened from Configure Settings. */
export const MARKER_MENU = Object.freeze({
  key: "markerMenu",
  name: "PENTARYN_CREATURES.settings.markerMenu.name",
  label: "PENTARYN_CREATURES.settings.markerMenu.label",
  hint: "PENTARYN_CREATURES.settings.markerMenu.hint",
  icon: "fa-solid fa-eye-low-vision",
  restricted: true,
});

/**
 * Called from the entry's `init` handler (rows already registered are skipped). `menuClass` builds
 * the menu's application class (markers-menu.mjs); a client without registerMenu skips the menu.
 * @param {{ menuClass?: () => Function }} [opts]
 */
export function registerSettings({ menuClass = null } = {}) {
  defineSettings(MODULE, SETTINGS);
  const settings = globalThis.game?.settings;
  if (!menuClass || typeof settings?.registerMenu !== "function") return;
  if (settings.menus?.has?.(`${MODULE}.${MARKER_MENU.key}`)) return;
  const { key, ...data } = MARKER_MENU;
  settings.registerMenu(MODULE, key, { ...data, type: menuClass() });
}

/** Write one of this module's settings (the Token markers menu's save). */
export async function saveSetting(key, value) {
  return globalThis.game.settings.set(MODULE, key, value);
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
