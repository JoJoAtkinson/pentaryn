/**
 * Settings for pentaryn-combat. Every behaviour change is one world setting, default on, so any of
 * them can be switched off to get today's HUD back (README → Adjustments). Two per-user choices
 * (quick mode, rider auto/ask) are user flags, not settings, so each player keeps their own.
 *
 * `setting()` falls back to the default when a key is unregistered or unreadable, so a hook never
 * throws inside a render because of a missing setting.
 */

import { MOD } from "./combat-core.mjs";

export const DEFAULTS = Object.freeze({
  fullAttack: true,        // Full Attack button + swing strip
  swingPips: true,         // Action pips count swings (2 → 1 → 0)
  followUps: true,         // Off-hand / Nick / Flurry / Martial Arts / Hew buttons
  gateFollowUps: true,     // Pole Strike only after the Attack action with a qualifying weapon
  riderOffers: true,       // "+ Sneak Attack 3d6" on attack cards; auto mode per player
  recklessToggle: true,    // "Reckless Attack: On/Off" on the Special bar (applies the Reckless effect)
  weaponBonuses: true,     // Two-Weapon Fighting @mod / Great Weapon Master +PB in the weapon's damage roll
  offhandModeReset: true,  // a main-hand swing never inherits Offhand from the last roll
  offhandPip: true,        // an off-hand swing spends the Bonus pip, not the Action pip
  seedWeaponSets: true,    // empty Argon weapon set 1/2 filled once for PCs (never overwrites)
  multiattack: true,       // Full Attack for NPC / Wild Shape Multiattack
  skipPickerGuide: true,   // mark Argon's one-time Target Picker Tutorial as seen; "right-click cancels" on its cursor label
  // turn flow (turnflow.mjs, usability re-run Area 1)
  specialActions: true,    // Argon's Dash/Disengage/Dodge/Hide/Ready/Shove spend the Action; Dash adds Speed; Dodge ends; Hide rolls
  reactionSlot: true,      // Reaction bar weapon = "Opportunity Attack", spends the Reaction, not a swing
  escRollDialog: true,     // Esc closes a dnd5e roll dialog without clicking into it first
  tidyCancelledAttacks: true, // a cancelled attack roll deletes its own empty usage card
  deathSaveDamage: true,   // damage at 0 HP adds a Death Saving Throw failure (two on a crit)
  portraitConditions: true, // status conditions (Prone, Poisoned, Dodging…) on the HUD portrait
  hudFollows: true,        // the HUD follows the one token left selected and your combatant's turn
  clearTargetsAfterTurn: true, // a player's targets are released when their turn ends
  // usability Area 2, fixer pass 2
  dockRollDialogs: true,   // during a Full Attack each roll window sits just above the swing strip, named "swing i of n"
  scrollingTextGuard: true, // background tab: no floating canvas text, no chat-card pop-ups; a double destroy is ignored (core errors)
  // usability Area 3 re-run, fixer pass 2
  bonusPip: true,          // a Bonus-action feature or spell (Rage, Steady Aim, Divine Smite, Lay on Hands…) spends the Bonus pip
  selfEffects: true,       // a self-only feature with one effect (Rage) switches its effect on when used (no Apply click)
  steadyAim: true,         // Steady Aim gives a "Steady Aim" effect: next attack defaults to Advantage, Speed 0, gone after that attack
  drawerNearButton: true,  // Argon's drawers (Use Feature, Cast Spell…) open above their own button, not at the HUD's far left
  // usability Area 5 re-run
  spellPips: true,         // a spell or feature used from the HUD spends its Action / Reaction pip; pips survive a HUD re-bind
  quickenedSpell: true,    // Quickened Spell makes the next 1-Action spell this turn spend the Bonus pip, not the Action
  helperTokenControl: true // your token is selected again when an area handle or a summon you held is deleted
});

export function registerSettings() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (game.settings.settings.has(`${MOD}.${key}`)) continue;
    game.settings.register(MOD, key, {
      name: `PENTARYN_COMBAT.Setting.${key}.Name`,
      hint: `PENTARYN_COMBAT.Setting.${key}.Hint`,
      scope: "world", config: true, type: Boolean, default: value,
      // Argon builds its bars once per render; the next HUD render picks the change up.
      // Only a bound HUD: with no actor Argon's panels throw "reading 'system' of null".
      onChange: () => { try { if (ui.ARGON?._actor) ui.ARGON.render(); } catch { /* HUD closed */ } }
    });
  }
}

/** Read a setting; the default if it is unregistered or unreadable. */
export function setting(key) {
  try {
    return game.settings.get(MOD, key);
  } catch {
    return DEFAULTS[key];
  }
}

/* ── per-user choices (user flags) ───────────────────────────────────────── */

/** Quick mode: swings after the first skip the dialog and reuse its Normal/Adv/Dis. Off by default. */
export function quickMode() {
  return !!game.user?.getFlag?.(MOD, "quick");
}

export async function setQuickMode(on) {
  return game.user?.setFlag?.(MOD, "quick", !!on);
}

/** "ask" (default) or "auto" for one rider key. */
export function riderMode(key) {
  return game.user?.getFlag?.(MOD, `riders.${key}`) === "auto" ? "auto" : "ask";
}

export async function setRiderMode(key, mode) {
  return game.user?.setFlag?.(MOD, `riders.${key}`, mode === "auto" ? "auto" : "ask");
}
