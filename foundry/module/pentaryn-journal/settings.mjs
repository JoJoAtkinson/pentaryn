/**
 * Pentaryn Player Journal — settings. The only file outside lib/ that calls game.settings.
 *
 * Rows carry LITERAL label keys, exactly the ones registered before the migration (D4): note that
 * `singlePageReadables` is labelled `PENTARYN_JOURNAL.settings.singlePage.*` — the key path differs
 * from the setting key, which a literal row makes fine.
 *
 * `folderName` is world and hidden (`config: false`): never shown in the settings menu; a GM changes
 * it from the console. Its labels (W2-J1, Joe 2026-10-12) exist for C51 and describe() readers.
 *
 * A change reaches the features through `whenChanged(key, fn)`: the rows' `onChange` call the
 * listeners a feature registered, so this file never imports a feature (C16).
 */

import { MODULE } from "./journal-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** key → Set of listeners, called with the new value. */
const listeners = new Map();

function changed(key, value) {
  for (const fn of [...(listeners.get(key) ?? [])]) fn(value);
}

/**
 * Call `fn(value)` whenever setting `key` changes (on every client, as Foundry runs a world
 * setting's onChange). @returns {() => void} removes the listener
 */
export function whenChanged(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "gmButton", scope: "world", config: true, type: Boolean, default: false,
    name: "PENTARYN_JOURNAL.settings.gmButton.name",
    hint: "PENTARYN_JOURNAL.settings.gmButton.hint",
    onChange: value => changed("gmButton", value),
    doc: "Show the Add bar to GMs too (for testing the player flow). Read live; a change refreshes every open bar.",
  },
  {
    key: "singlePageReadables", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_JOURNAL.settings.singlePage.name",
    hint: "PENTARYN_JOURNAL.settings.singlePage.hint",
    onChange: value => changed("singlePageReadables", value),
    doc: "A one-page eye readable opens without its page list for players. Read live; a change re-applies to open journals.",
  },
  {
    key: "folderName", scope: "world", config: false, type: String, default: "Player Journals",
    name: "PENTARYN_JOURNAL.settings.folderName.name",
    hint: "PENTARYN_JOURNAL.settings.folderName.hint",
    doc: "The folder personal journals live in (hidden; set from the console). Empty → the localised default. Read live.",
  },
]);

/**
 * Called from the entry's `init` handler, and again by a hot patch (rows already registered are
 * skipped). No i18n root: every row names its labels.
 */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS);
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

/** The kit `settings()` member: `{ key: liveValue }` for every row. */
export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
