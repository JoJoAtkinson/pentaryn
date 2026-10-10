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
  multiattack: true        // Full Attack for NPC / Wild Shape Multiattack
});

export function registerSettings() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (game.settings.settings.has(`${MOD}.${key}`)) continue;
    game.settings.register(MOD, key, {
      name: `PENTARYN_COMBAT.Setting.${key}.Name`,
      hint: `PENTARYN_COMBAT.Setting.${key}.Hint`,
      scope: "world", config: true, type: Boolean, default: value,
      // Argon builds its bars once per render; the next HUD render picks the change up.
      onChange: () => { try { ui.ARGON?.render?.(); } catch { /* HUD closed */ } }
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
