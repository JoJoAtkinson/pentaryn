/**
 * Pentaryn Feature Riders — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Every row carries LITERAL `name` and `hint` keys in today's `PENTARYN_RIDERS.settings.<key>.name`
 * shape (D4), so the i18n gate sees each one and lang/en.json is unchanged. The rows are in today's
 * registration order (Configure Settings shows them in this order; glue.test pins it).
 *
 * Two readers keep today's per-site failure semantics (guide S4; the kit's settingReader would
 * return the row default `true` instead):
 *   settingOr(key, fallback)  the feature switches: `false` when the setting cannot be read
 *                             (before init, a hot-patched client), else `value !== false`
 *   settingRaw(key)           `enabled` and `hdControls`: rethrows; the hook that reads it catches
 *                             and warns (`… | riders skipped`, `… | hit dice controls skipped`)
 */

import { I18N, MODULE } from "./riders-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** Re-render every open character sheet (the Hit Dice − / +, the spell view toggle appear or go). Cheap, idempotent. */
function rerenderCharacterSheets() {
  for (const a of foundry.applications.instances.values()) if (a.document?.type === "character" && a.rendered) a.render();
}

/**
 * Every row is a Boolean, on by default, shown in Configure Settings and read live on each use, so
 * none needs `requiresReload`. All are world settings except the last, `projectileChatTab` (client:
 * whether a cast may move this player's sidebar is each player's call).
 * @type {import("./lib/settings.mjs").SettingRow[]}
 */
export const SETTINGS = Object.freeze([
  {
    key: "rituals", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.rituals.name",
    hint: "PENTARYN_RIDERS.settings.rituals.hint",
    doc: "Ritual Adept: unprepared ritual spells get a Rituals group on Argon's Cast Spell panel and start with the slot unticked.",
  },
  {
    key: "longCasts", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.longCasts.name",
    hint: "PENTARYN_RIDERS.settings.longCasts.hint",
    doc: "A 'Longer casts' group (casting time a minute or more) on Argon's Action-bar Cast Spell panel.",
  },
  {
    key: "concentrationSummons", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.concentrationSummons.name",
    hint: "PENTARYN_RIDERS.settings.concentrationSummons.hint",
    doc: "Tokens a concentration spell summoned are removed when that concentration ends.",
  },
  {
    key: "concentrationAutoBreak", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.concentrationAutoBreak.name",
    hint: "PENTARYN_RIDERS.settings.concentrationAutoBreak.hint",
    doc: "A failed concentration save ends concentration on the roller's client; the save card shows DC and result.",
  },
  {
    key: "castDefaults", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.castDefaults.name",
    hint: "PENTARYN_RIDERS.settings.castDefaults.hint",
    doc: "Summons open with Place Summons ticked; a self-only spell's card drops leftover targets.",
  },
  {
    key: "arcaneRecovery", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.arcaneRecovery.name",
    hint: "PENTARYN_RIDERS.settings.arcaneRecovery.hint",
    doc: "After Arcane Recovery is used, the owner ticks the spent slots to recover in one dialog; a D&D Beyond import's own Arcane Recovery macro is skipped for that use.",
  },
  {
    key: "enabled", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.enabled.name",
    hint: "PENTARYN_RIDERS.settings.enabled.hint",
    doc: "Master switch for the damage and healing riders, the damage-tray preset and Battle Medic.",
  },
  {
    key: "hdControls", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.hdControls.name",
    hint: "PENTARYN_RIDERS.settings.hdControls.hint",
    onChange: rerenderCharacterSheets,
    doc: "Hit Dice − / + on the character sheet outside edit mode; a change re-renders open character sheets.",
  },
  {
    key: "projectiles", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.projectiles.name",
    hint: "PENTARYN_RIDERS.settings.projectiles.hint",
    doc: "Scorching Ray and Magic Missile cards get one button per ray / dart (3, plus one per level above the spell's), each rolled at the creature targeted when clicked; dnd5e's automatic first roll after the cast is skipped, so the buttons are the one way to roll.",
  },
  {
    key: "spellView", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.spellView.name",
    hint: "PENTARYN_RIDERS.settings.spellView.hint",
    onChange: rerenderCharacterSheets,
    doc: "The character sheet's Spells tab opens on the spells ready to cast, with a Prepared / All spells toggle remembered per user and actor; a change re-renders open character sheets.",
  },
  {
    key: "projectileChatTab", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_RIDERS.settings.projectileChatTab.name",
    hint: "PENTARYN_RIDERS.settings.projectileChatTab.hint",
    doc: "Client: casting Scorching Ray or Magic Missile while the chat log is off screen opens the sidebar on Chat, where the ray / dart buttons stay (a chat notification is dismissed after 5 s).",
  },
]);

/** Called from the entry's `init` (and again by a hot patch: rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N, labels: { section: "settings", name: "name", hint: "hint" } });
}

/** A feature switch: `fallback` when the setting cannot be read, else `value !== false`. */
export function settingOr(key, fallback = false) {
  try { return game.settings.get(MODULE, key) !== false; } catch { return fallback; }
}

/** The raw value; throws when unregistered (the calling hook catches and warns, as today). */
export function settingRaw(key) {
  return game.settings.get(MODULE, key);
}

/** The kit reader (row default when unreadable): `ctx.setting`, selftest. */
export const setting = settingReader(MODULE, SETTINGS);

/** `{ key: value }` for all eleven rows (api `settings()`). */
export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
