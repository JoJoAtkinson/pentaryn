/**
 * Settings for pentaryn-combat. Every behaviour change is one world setting, default on, so any of
 * them can be switched off to get today's HUD back (README → Settings). Two per-user choices
 * (quick mode, rider auto/ask) are user flags, not settings, so each player keeps their own.
 *
 * `SETTINGS` is the table (blueprint §5.3): one row per world setting, in registration order, with
 * literal label keys. `setting()` falls back to the row's default when a key is unregistered or
 * unreadable, so a hook never throws inside a render because of a missing setting. Argon's own
 * settings are read here too (`argonSetting`), and pentaryn-aoe's auto-damage (`aoeAutoDamage`,
 * the C23 exception), so no other file calls game.settings.
 */

import { I18N, MODULE } from "./combat-core.mjs";
import { defineSettings, settingReader } from "./lib/settings.mjs";

const ARGON = "enhancedcombathud";

export const SETTINGS = Object.freeze([
  { key: "fullAttack", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.fullAttack.Name", hint: "PENTARYN_COMBAT.Setting.fullAttack.Hint",
    doc: "Full Attack button + swing strip" },
  { key: "swingPips", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.swingPips.Name", hint: "PENTARYN_COMBAT.Setting.swingPips.Hint",
    doc: "Action pips count swings (2 → 1 → 0)" },
  { key: "followUps", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.followUps.Name", hint: "PENTARYN_COMBAT.Setting.followUps.Hint",
    doc: "Off-hand / Nick / Flurry / Martial Arts / Hew buttons" },
  { key: "gateFollowUps", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.gateFollowUps.Name", hint: "PENTARYN_COMBAT.Setting.gateFollowUps.Hint",
    doc: "Pole Strike only after the Attack action with a qualifying weapon" },
  { key: "riderOffers", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.riderOffers.Name", hint: "PENTARYN_COMBAT.Setting.riderOffers.Hint",
    doc: "\"+ Sneak Attack 3d6\" on attack cards; auto mode per player" },
  { key: "recklessToggle", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.recklessToggle.Name", hint: "PENTARYN_COMBAT.Setting.recklessToggle.Hint",
    doc: "\"Reckless Attack: On/Off\" on the Special bar (applies the Reckless effect)" },
  { key: "weaponBonuses", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.weaponBonuses.Name", hint: "PENTARYN_COMBAT.Setting.weaponBonuses.Hint",
    doc: "Two-Weapon Fighting @mod / Great Weapon Master +PB in the weapon's damage roll" },
  { key: "offhandModeReset", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.offhandModeReset.Name", hint: "PENTARYN_COMBAT.Setting.offhandModeReset.Hint",
    doc: "a main-hand swing never inherits Offhand from the last roll" },
  { key: "offhandPip", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.offhandPip.Name", hint: "PENTARYN_COMBAT.Setting.offhandPip.Hint",
    doc: "an off-hand swing spends the Bonus pip, not the Action pip" },
  { key: "seedWeaponSets", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.seedWeaponSets.Name", hint: "PENTARYN_COMBAT.Setting.seedWeaponSets.Hint",
    doc: "empty Argon weapon set 1/2 filled once for PCs (never overwrites)" },
  { key: "multiattack", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.multiattack.Name", hint: "PENTARYN_COMBAT.Setting.multiattack.Hint",
    doc: "Full Attack for NPC / Wild Shape Multiattack" },
  { key: "skipPickerGuide", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.skipPickerGuide.Name", hint: "PENTARYN_COMBAT.Setting.skipPickerGuide.Hint",
    doc: "mark Argon's one-time Target Picker Tutorial as seen; \"right-click cancels\" on its cursor label" },
  // turn flow (turnflow.mjs, usability re-run Area 1)
  { key: "specialActions", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.specialActions.Name", hint: "PENTARYN_COMBAT.Setting.specialActions.Hint",
    doc: "Argon's Dash/Disengage/Dodge/Hide/Ready/Shove spend the Action; Dash adds Speed; Dodge ends; Hide rolls" },
  { key: "reactionSlot", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.reactionSlot.Name", hint: "PENTARYN_COMBAT.Setting.reactionSlot.Hint",
    doc: "Reaction bar weapon = \"Opportunity Attack\", spends the Reaction, not a swing" },
  { key: "escRollDialog", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.escRollDialog.Name", hint: "PENTARYN_COMBAT.Setting.escRollDialog.Hint",
    doc: "Esc closes a dnd5e roll dialog without clicking into it first" },
  { key: "tidyCancelledAttacks", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.tidyCancelledAttacks.Name", hint: "PENTARYN_COMBAT.Setting.tidyCancelledAttacks.Hint",
    doc: "a cancelled attack roll deletes its own empty usage card" },
  { key: "deathSaveDamage", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.deathSaveDamage.Name", hint: "PENTARYN_COMBAT.Setting.deathSaveDamage.Hint",
    doc: "damage at 0 HP adds a Death Saving Throw failure (two on a crit)" },
  { key: "portraitConditions", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.portraitConditions.Name", hint: "PENTARYN_COMBAT.Setting.portraitConditions.Hint",
    doc: "status conditions (Prone, Poisoned, Dodging…) on the HUD portrait" },
  { key: "hudFollows", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.hudFollows.Name", hint: "PENTARYN_COMBAT.Setting.hudFollows.Hint",
    doc: "the HUD follows the one token left selected and your combatant's turn" },
  { key: "clearTargetsAfterTurn", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.clearTargetsAfterTurn.Name", hint: "PENTARYN_COMBAT.Setting.clearTargetsAfterTurn.Hint",
    doc: "a player's targets are released when their turn ends" },
  // usability Area 2, fixer pass 2
  { key: "dockRollDialogs", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.dockRollDialogs.Name", hint: "PENTARYN_COMBAT.Setting.dockRollDialogs.Hint",
    doc: "during a Full Attack each roll window sits just above the swing strip, named \"swing i of n\"" },
  { key: "scrollingTextGuard", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.scrollingTextGuard.Name", hint: "PENTARYN_COMBAT.Setting.scrollingTextGuard.Hint",
    doc: "background tab: no floating canvas text, no chat-card pop-ups; a double destroy is ignored (core errors)" },
  // usability Area 3 re-run, fixer pass 2
  { key: "bonusPip", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.bonusPip.Name", hint: "PENTARYN_COMBAT.Setting.bonusPip.Hint",
    doc: "a Bonus-action feature or spell (Rage, Steady Aim, Divine Smite, Lay on Hands…) spends the Bonus pip" },
  { key: "selfEffects", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.selfEffects.Name", hint: "PENTARYN_COMBAT.Setting.selfEffects.Hint",
    doc: "a self-only feature with one effect (Rage) switches its effect on when used (no Apply click)" },
  { key: "steadyAim", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.steadyAim.Name", hint: "PENTARYN_COMBAT.Setting.steadyAim.Hint",
    doc: "Steady Aim gives a \"Steady Aim\" effect: next attack defaults to Advantage, Speed 0, gone after that attack" },
  { key: "drawerNearButton", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.drawerNearButton.Name", hint: "PENTARYN_COMBAT.Setting.drawerNearButton.Hint",
    doc: "Argon's drawers (Use Feature, Cast Spell…) open above their own button, not at the HUD's far left" },
  // usability Area 5 re-run
  { key: "spellPips", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.spellPips.Name", hint: "PENTARYN_COMBAT.Setting.spellPips.Hint",
    doc: "a spell or feature used from the HUD spends its Action / Reaction pip; pips survive a HUD re-bind" },
  { key: "quickenedSpell", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.quickenedSpell.Name", hint: "PENTARYN_COMBAT.Setting.quickenedSpell.Hint",
    doc: "Quickened Spell makes the next 1-Action spell this turn spend the Bonus pip, not the Action" },
  { key: "helperTokenControl", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.helperTokenControl.Name", hint: "PENTARYN_COMBAT.Setting.helperTokenControl.Hint",
    doc: "your token is selected again when an area handle or a summon you held is deleted" },
  // usability Area 3 re-run (2026-10-11)
  { key: "enterUses", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_COMBAT.Setting.enterUses.Name", hint: "PENTARYN_COMBAT.Setting.enterUses.Hint",
    doc: "Enter in a usage window's number box (Lay on Hands' points) uses the ability" },
].map(Object.freeze));

/** `{ key: default }` for every row, derived from the table. */
export const DEFAULTS = Object.freeze(Object.fromEntries(SETTINGS.map(r => [r.key, r.default])));

/**
 * Register every row in table order (rows already registered are skipped). `onChange` is the
 * entry's callback: Argon builds its bars once per render, so the next HUD render picks a change up.
 */
export function registerSettings({ onChange = () => undefined } = {}) {
  return defineSettings(MODULE, SETTINGS.map(r => ({ ...r, onChange })), { i18nRoot: I18N });
}

/** Read a setting; the default if it is unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

/**
 * Read one of Argon's (enhancedcombathud) settings. Throws as game.settings.get does, unless
 * `onError` is given: then what it returns (each call site keeps its own fallback).
 */
export function argonSetting(key, onError) {
  try {
    return game.settings.get(ARGON, key);
  } catch (err) {
    if (onError) return onError(err);
    throw err;
  }
}

/** Write one of Argon's settings (its one-time picker tutorial flag). */
export function setArgonSetting(key, value) {
  return game.settings.set(ARGON, key, value);
}

/** Is one of Argon's settings registered (Argon active and initialised)? */
export function hasArgonSetting(key) {
  return game.settings.settings.has(`${ARGON}.${key}`);
}

/**
 * Is pentaryn-aoe's auto-damage on (active and `autoDamageOnHit` set)? False on any failure. Read
 * directly (C23 exception): aoe's `settings()` member is published at `ready`, but chat cards
 * first render before it.
 */
export function aoeAutoDamage() {
  try { return !!game.modules.get("pentaryn-aoe")?.active && !!game.settings.get("pentaryn-aoe", "autoDamageOnHit"); }
  catch { return false; }
}

/* ── per-user choices (user flags) ───────────────────────────────────────── */

/** Quick mode: swings after the first skip the dialog and reuse its Normal/Adv/Dis. Off by default. */
export function quickMode() {
  return !!game.user?.getFlag?.(MODULE, "quick");
}

export async function setQuickMode(on) {
  return game.user?.setFlag?.(MODULE, "quick", !!on);
}

/** "ask" (default) or "auto" for one rider key. */
export function riderMode(key) {
  return game.user?.getFlag?.(MODULE, `riders.${key}`) === "auto" ? "auto" : "ask";
}

export async function setRiderMode(key, mode) {
  return game.user?.setFlag?.(MODULE, `riders.${key}`, mode === "auto" ? "auto" : "ask");
}
