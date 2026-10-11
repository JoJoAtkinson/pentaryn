/**
 * Pentaryn Ping Log — settings: the SETTINGS table and the only `game.settings` calls outside lib/.
 *
 * Labels are literal English until the Wave 7 restart batch adds `lang/en.json` and the module.json
 * `languages` entry (guide step 10): a key would render raw on the settings screen before that.
 *
 * `log` is the ping store (hidden, world). It is registered by hand, with exactly the option object
 * it has always had (name, scope, config, type, default): the kit's defineSettings would add a
 * `hint` key to a non-store row and drop the `name` from a store row, and the glue test pins the
 * options key by key. Step 10 drops the name and registers it through defineSettings.
 */

import { I18N, MODULE } from "./pings-core.mjs";
import { defineSettings, settingsSnapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = [
  {
    key: "log", store: true, scope: "world", config: false, type: Array, default: [],
    name: "Ping log",
    doc: "The ping store: the newest `max` records { t, userId, userName, sceneId, sceneName, x, y }, oldest first. Written by GM clients only, at most once per 250 ms.",
  },
  {
    key: "max", scope: "world", config: true, type: Number, default: 50,
    name: "Pings to keep",
    hint: "How many of the most recent pings to remember. Older ones fall off the end.",
    doc: "How many pings the store keeps; not a finite positive number → 50; at most 500. Read on every ping, so a change applies at once.",
  },
];

const LOG_ROW = SETTINGS[0];

/** init, every client: log then max, as before. Rows already registered (a hot re-import) are skipped. */
export function registerSettings() {
  if (!game.settings.settings?.has?.(`${MODULE}.log`)) {
    game.settings.register(MODULE, "log", {
      name: LOG_ROW.name,
      scope: LOG_ROW.scope,
      config: LOG_ROW.config,
      type: LOG_ROW.type,
      default: LOG_ROW.default,
    });
  }
  defineSettings(MODULE, SETTINGS.filter(r => r.key !== "log"), { i18nRoot: I18N });
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
