/**
 * World settings for pentaryn-aoe, as one table. The only file outside lib/ that calls
 * game.settings.register/get/set.
 *
 * Every row carries LITERAL `name` and `hint` keys (C51). Rows register in table order, which is
 * the order of the settings menu: the 16 booleans first (the old BOOLS order), then
 * npcSaveRollMode — golden/settings-register.json pins it.
 *
 * `setting(key)` falls back to the row default. That matters twice: while the module is
 * hot-patched into a client before the server has scanned it, and on any client where
 * registration failed. A missing setting must never throw inside a chat or region hook.
 */

import { I18N, MODULE } from "./core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  { key: "handleTokens", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.handleTokens.Name", hint: "PENTARYN_AOE.Setting.handleTokens.Hint",
    doc: "Part A: a small owned handle token on every spell area; drag it to move the area, delete it to delete the area." },
  { key: "removeAreaButton", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.removeAreaButton.Name", hint: "PENTARYN_AOE.Setting.removeAreaButton.Hint",
    doc: "Part A: a Remove all templates icon next to Place Template on spell cards that place an area." },
  { key: "instantCleanup", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.instantCleanup.Name", hint: "PENTARYN_AOE.Setting.instantCleanup.Hint",
    doc: "Part B: an instantaneous spell's area is deleted once every ticked row is applied." },
  { key: "concentrationCleanup", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.concentrationCleanup.Name", hint: "PENTARYN_AOE.Setting.concentrationCleanup.Hint",
    doc: "Part A: when concentration ends, that spell's areas are deleted on every scene (active GM)." },
  { key: "resolveSaves", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.resolveSaves.Name", hint: "PENTARYN_AOE.Setting.resolveSaves.Hint",
    doc: "Part B: a save spell's damage roll builds the GM tray, rolls monster saves and asks players for theirs." },
  { key: "autoApplyNpc", scope: "world", config: true, type: Boolean, default: false,
    name: "PENTARYN_AOE.Setting.autoApplyNpc.Name", hint: "PENTARYN_AOE.Setting.autoApplyNpc.Hint",
    doc: "Part B: apply monster damage as soon as their saves are rolled, without Apply." },
  { key: "promptPlayers", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.promptPlayers.Name", hint: "PENTARYN_AOE.Setting.promptPlayers.Hint",
    doc: "Part B: post one request card so each player rolls their own character's save." },
  { key: "autoDamageOnHit", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.autoDamageOnHit.Name", hint: "PENTARYN_AOE.Setting.autoDamageOnHit.Hint",
    doc: "Part C: roll damage straight after an attack that hits (read by pentaryn-combat too)." },
  { key: "autoApplySelf", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.autoApplySelf.Name", hint: "PENTARYN_AOE.Setting.autoApplySelf.Hint",
    doc: "Part D: a self-cast card's one effect goes on the caster automatically." },
  { key: "highlightUnapplied", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.highlightUnapplied.Name", hint: "PENTARYN_AOE.Setting.highlightUnapplied.Hint",
    doc: "Part D: an Effects tray nobody has applied yet is outlined (cards under an hour old)." },
  { key: "carefulSpell", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.carefulSpell.Name", hint: "PENTARYN_AOE.Setting.carefulSpell.Hint",
    doc: "Part B: Careful Spell marks up to CHA mod of the caster's side as protected in the next save spell's area." },
  { key: "refundCancelledArea", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.refundCancelledArea.Name", hint: "PENTARYN_AOE.Setting.refundCancelledArea.Hint",
    doc: "Part F: a cancelled area placement refunds what the cast spent and removes its card." },
  { key: "playerStatus", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.playerStatus.Name", hint: "PENTARYN_AOE.Setting.playerStatus.Hint",
    doc: "Part B: the caster's own damage card shows one status line; GM-only monster saves are hidden from players." },
  { key: "untargetedSelf", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.untargetedSelf.Name", hint: "PENTARYN_AOE.Setting.untargetedSelf.Hint",
    doc: "Part D: a touch spell for one willing creature cast at nobody goes on the caster." },
  { key: "noSpellStacking", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.noSpellStacking.Name", hint: "PENTARYN_AOE.Setting.noSpellStacking.Hint",
    doc: "Part D: a spell's effect from another source replaces the same spell's effect instead of stacking." },
  { key: "aimSelfAreas", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_AOE.Setting.aimSelfAreas.Name", hint: "PENTARYN_AOE.Setting.aimSelfAreas.Hint",
    doc: "Part G: a Self-range cone or line keeps its point on the caster and turns toward the mouse." },
  { key: "npcSaveRollMode", scope: "world", config: true, type: String, default: "gm",
    name: "PENTARYN_AOE.Setting.npcSaveRollMode.Name", hint: "PENTARYN_AOE.Setting.npcSaveRollMode.Hint",
    // Core v14 message modes. dnd5e 6 hands the roll mode to core as messageMode, and core
    // replaces a name it does not know (the old "gmroll") with the client default, i.e. public.
    choices: {
      gm: "PENTARYN_AOE.Setting.npcSaveRollMode.gm",
      blind: "PENTARYN_AOE.Setting.npcSaveRollMode.blind",
      public: "PENTARYN_AOE.Setting.npcSaveRollMode.public",
    },
    doc: "Part B: the message mode of the saves the GM's client rolls for monsters (gm, blind or public)." },
]);

/** Every row's default, by key (kept exported: the old DEFAULTS object). */
export const DEFAULTS = Object.freeze(Object.fromEntries(SETTINGS.map(r => [r.key, r.default])));

/** Called from the entry's init, and again by a hot patch (rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N });
}

/** The pre-6.0 roll-mode names this setting stored (core's own mapping turns them into message modes). */
export const LEGACY_ROLL_MODES = ["gmroll", "blindroll", "publicroll"];

/**
 * One-shot, active GM: a world that stored a legacy roll-mode name ("gmroll") gets the core v14
 * message mode ("gm") written back, so the settings menu shows a real choice again. Until it has
 * run (a hot-patched client), resolve.mjs maps the stored name at the roll anyway.
 */
export async function migrateSettings() {
  if (!game.users?.activeGM?.isSelf) return null;
  let stored;
  try { stored = game.settings.get(MODULE, "npcSaveRollMode"); } catch { return null; }
  if (!LEGACY_ROLL_MODES.includes(stored)) return null;
  const next = foundry.dice.Roll._mapLegacyRollMode(stored);
  await game.settings.set(MODULE, "npcSaveRollMode", next);
  console.info(`${MODULE} | npcSaveRollMode ${stored} → ${next}`);
  return next;
}

/** Read a setting; the row default if it is unregistered or unreadable; undefined for an unknown key. */
export const setting = settingReader(MODULE, SETTINGS);

/** `{ key: liveValue }` for every row (the API's settings() member). */
export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}

/** The booleans, in registration order (finding -13: derived from the table, never re-listed). */
const BOOLS = SETTINGS.filter(r => r.type === Boolean).map(r => r.key);

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { BOOLS };
