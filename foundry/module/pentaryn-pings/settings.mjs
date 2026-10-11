/**
 * Pentaryn Ping Log — settings: the SETTINGS table and the only `game.settings` calls outside lib/.
 *
 * Labels are `PENTARYN_PINGS.Setting.<key>.Name/Hint` keys from `lang/en.json` (guide step 10, J13);
 * the rendered English is the same as the literals they replaced.
 *
 * `log` is the ping store: a `store: true` row (hidden, world, no label — the label was never shown).
 */

import { I18N, MODULE } from "./pings-core.mjs";
import { defineSettings, settingsSnapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = [
  {
    key: "log", store: true, scope: "world", config: false, type: Array, default: [],
    doc: "The ping store: the newest `max` records { t, userId, userName, sceneId, sceneName, x, y }, oldest first. Written by GM clients only, at most once per 250 ms.",
  },
  {
    key: "max", scope: "world", config: true, type: Number, default: 50,
    name: "PENTARYN_PINGS.Setting.max.Name",
    hint: "PENTARYN_PINGS.Setting.max.Hint",
    doc: "How many pings the store keeps; not a finite positive number → 50; at most 500. Read on every ping, so a change applies at once.",
  },
];

/** init, every client: log then max, as before. Rows already registered (a hot re-import) are skipped. */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N });
}

/**
 * The stored log, or [] when it is unreadable or not an array. Returns the stored array itself
 * (live: the settings cache), not a copy.
 * @param {{ log: { warn: Function } }} deps
 */
export function readLog({ log }) {
  try {
    const v = game.settings.get(MODULE, "log");
    return Array.isArray(v) ? v : [];
  } catch (err) {
    log.warn("could not read the log", err);
    return [];
  }
}

/** Persist the log (GM clients only: world settings are not player-writable). */
export function writeLog(list) {
  return game.settings.set(MODULE, "log", list);
}

/** The raw `max` value; core `capLimit` clamps it. */
export function maxSetting() {
  return game.settings.get(MODULE, "max");
}

/** The kit `settings()` member: `{ log: { store: true, size }, max }` — never the log's contents. */
export function settingsView() {
  return settingsSnapshot(MODULE, SETTINGS);
}
