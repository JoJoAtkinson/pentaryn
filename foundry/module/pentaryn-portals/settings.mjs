/**
 * Pentaryn Portal Cards — settings (usability Area 6 re-run). The only file outside lib/ that
 * calls game.settings.
 *
 * Every read is live through setting(), so a change applies at once: no row needs requiresReload.
 * The labels are plain English until the Wave 7 restart batch ships lang/en.json (it changes
 * module.json, a restart); then they become PENTARYN_PORTALS.Setting.<key>.Name/Hint literals.
 */

import { I18N, MODULE } from "./portals-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "teleportDefault", scope: "world", config: true, type: Boolean, default: true,
    name: "Teleport is the default answer",
    hint: "The teleport question opens with Teleport focused (Enter teleports). Off: core's default, Don't Teleport.",
    doc: "Core's teleport confirm opens with Teleport focused instead of Don't Teleport (Esc and the X still decline).",
  },
  {
    key: "spreadArrivals", scope: "world", config: true, type: Boolean, default: true,
    name: "Arrivals step off an occupied square",
    hint: "A player character who comes through a portal onto a square someone already stands on moves to the nearest free square around it (the GM's client does it).",
    doc: "The active GM moves a PC that arrives through a portal onto an occupied square to the nearest free one.",
  },
  {
    key: "confirmPartyTeleport", scope: "world", config: true, type: Boolean, default: true,
    name: "Confirm a party teleport",
    hint: "The GM's Teleport party first lists who will move (each follower beside its PC) and asks. Off: it moves at once.",
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
