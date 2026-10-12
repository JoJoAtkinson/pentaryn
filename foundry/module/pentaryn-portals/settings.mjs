/**
 * Pentaryn Portal Cards — settings (usability Area 6 re-run). The only file outside lib/ that
 * calls game.settings.
 *
 * Every read is live through setting(), so a change applies at once: no row needs requiresReload.
 * The labels are PENTARYN_PORTALS.Setting.<key>.Name/Hint literals into lang/en.json, shipped with
 * module.json `languages` in the Wave 7 restart batch (-29, C51).
 */

import { I18N, MODULE } from "./portals-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "teleportDefault", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_PORTALS.Setting.teleportDefault.Name",
    hint: "PENTARYN_PORTALS.Setting.teleportDefault.Hint",
    doc: "Core's teleport confirm opens with Teleport focused instead of Don't Teleport (Esc and the X still decline).",
  },
  {
    key: "spreadArrivals", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_PORTALS.Setting.spreadArrivals.Name",
    hint: "PENTARYN_PORTALS.Setting.spreadArrivals.Hint",
    doc: "The active GM moves a PC that arrives through a portal onto an occupied square to the nearest free one.",
  },
  {
    key: "confirmPartyTeleport", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_PORTALS.Setting.confirmPartyTeleport.Name",
    hint: "PENTARYN_PORTALS.Setting.confirmPartyTeleport.Hint",
    doc: "teleportParty asks first, listing who moves; an API caller passes { confirm: false } to skip the dialog.",
  },
]);

/** Called from the entry's `init` (rows already registered are skipped, so a hot patch is safe). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N });
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

/** The kit `settings()` member. */
export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
