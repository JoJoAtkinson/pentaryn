/**
 * pentaryn-importer — settings. The only file outside lib/ that calls game.settings.
 *
 * One row: `ddbCorrections` (world, default on) switches the DDB corrections off — both the run after a
 * ddb-importer sync and the GM-ready sweep (ddb-corrections.mjs). Read live through `setting()` on
 * every run, so a change applies without a reload. The NPC import (`game.pentaryn.import()`) has no
 * settings: its gate is module.json `flags.pentaryn` (README "Settings").
 */

import { MODULE } from "./importer-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "ddbCorrections", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_IMPORTER.settings.ddbCorrections.name",
    hint: "PENTARYN_IMPORTER.settings.ddbCorrections.hint",
    doc: "Correct D&D Beyond characters after every ddb-importer sync, and at GM login for any synced since. Read live.",
  },
]);

/** Called from the entry's `init` handler (rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS);
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

/** The kit `settings()` member: `{ key: liveValue }` for every row. */
export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
