/**
 * Pentaryn Combat core — weapons: what can swing, off-hand / Light / Nick partners, the default weapon and mode, Argon weapon-set seeds, which rule an Off-hand is.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

/**
 * The shape core reads a weapon as (built by shapes.mjs `weaponShape`):
 * { id, uuid, name, img, isWeapon, quantity, weaponLike, classification, equipped, melee, ranged,
 *   light, heavy, twoHanded, finesse, reach, thrown, loading, versatile, mastery, hasMastery, baseItem,
 *   activation, attackActivity, natural, unarmed, pactWeapon, ability }
 */

/**
 * A weapon the Attack action can swing: weapon-like (not a spell, a cantrip or a consumable such as a
 * Torch — `weaponLike` is false for those), equipped (natural weapons always are), with an action attack.
 */
export function canSwing(w) {
  return !!w && w.weaponLike !== false && !!w.attackActivity && (w.activation === "action" || !w.activation)
    && (w.equipped || w.natural || w.unarmed);
}

/**
 * Off-hand eligibility of a *second* weapon (the one making the Light extra attack). Only a real
 * weapon: never an Unarmed Strike (even with Dual Wielder, "a different weapon … a Melee weapon").
 */
export function offhandCapable(w, { enhancedDualWielding = false } = {}) {
  if (!w || !canSwing(w) || w.unarmed || w.isWeapon === false) return false;
  if (w.light) return true;
  return !!enhancedDualWielding && w.melee && !w.twoHanded;
}

/** The weapon the Light extra attack needs to have been made with (2024: a Light weapon, both with and without Dual Wielder). */
export function lightTrigger(w) {
  return !!w && !!w.light;
}

/** Nick: the extra-attack weapon has Nick mastery and the actor has mastery in it. */
export function nickCapable(w, opts = {}) {
  return offhandCapable(w, opts) && w.mastery === "nick" && !!w.hasMastery;
}

/**
 * The off-hand partner for `firstId`: a different qualifying item first, else the same item when it
 * is a stack of 2+ (two Handaxes on one item line are two different weapons — PHB Light property).
 */
export function partnerWeapon(weapons = [], firstId, qualifies) {
  return weapons.find(w => w.id !== firstId && qualifies(w))
    ?? weapons.find(w => w.id === firstId && (Number(w.quantity) || 1) >= 2 && qualifies(w))
    ?? null;
}

/**
 * Inside the Attack action, a Nick weapon adds one off-hand swing (once per turn), when the main
 * weapon is Light and a *different* Nick weapon is equipped (or a stack of 2+ of it).
 * @returns {{weaponId: string, mode: "offhand", kind: "nick"}[]}
 */
export function extraSwings({ main, weapons = [], turn = null, enhancedDualWielding = false } = {}) {
  if (!main || !lightTrigger(main) || turn?.nick) return [];
  const nick = partnerWeapon(weapons, main.id, w => nickCapable(w, { enhancedDualWielding }));
  return nick ? [{ weaponId: nick.id, mode: "offhand", kind: "nick" }] : [];
}

/** The weapon a Full Attack starts with: remembered, then the active set's primary, then the first melee. */
export function defaultWeapon({ weapons = [], remembered = null, setPrimary = null } = {}) {
  const ok = weapons.filter(canSwing);
  return ok.find(w => w.id === remembered)?.id
    ?? ok.find(w => w.id === setPrimary)?.id
    ?? ok.find(w => w.melee)?.id
    ?? ok[0]?.id
    ?? null;
}

/** The attack mode a main-hand swing defaults to (never Offhand). */
export function mainMode(modes = []) {
  const values = modes.map(m => (typeof m === "string" ? m : m?.value)).filter(Boolean);
  return values.find(v => !v.endsWith("offhand")) ?? values[0] ?? null;
}

/**
 * Set 1: first equipped melee weapon + a different equipped Light weapon (the off-hand);
 * set 2: first equipped ranged weapon. Returns null when there is nothing worth seeding.
 * @param {{uuid, melee, ranged, light, equipped, twoHanded}[]} weapons
 */
export function weaponSetSeed(weapons = []) {
  // Real weapons only: an attack cantrip or spell (Fire Bolt, Vampiric Touch, Alter Self) or a Torch
  // has an attack activity too, and would otherwise land in the weapon slot.
  const eq = weapons.filter(w => w.equipped && !w.unarmed && !w.natural && w.isWeapon !== false && w.weaponLike !== false);
  const main = eq.find(w => w.melee) ?? null;
  const off = main && !main.twoHanded ? eq.find(w => w.uuid !== main.uuid && w.light && w.melee) ?? null : null;
  const ranged = eq.find(w => w.ranged) ?? null;
  if (!main && !ranged) return null;
  return {
    1: { primary: main?.uuid ?? null, secondary: off?.uuid ?? null },
    2: { primary: ranged?.uuid ?? null, secondary: null },
    3: { primary: null, secondary: null }
  };
}

/** Seed only when the flag was never written (a player's own drag is never overwritten). */
export function shouldSeed(flag) {
  return flag === null || flag === undefined;
}

/**
 * Which rule an Off-hand follow-up comes from (PHB 2024). The Light property gives ONE extra attack,
 * with a different Light weapon; Nick moves that one into the Attack action. Dual Wielder's Enhanced
 * Dual Wielding is a SECOND, separate Bonus-action attack with any Melee weapon that lacks Two-Handed
 * (a Longsword qualifies). So an Off-hand button is Dual Wielder's when its weapon is not Light, or
 * when the Light attack is spent by Nick or offered as Nick beside it (Area 10 re-run: "Off-hand:
 * Longsword after Nick" read as a rules bug because the tooltip named only the Light property).
 * @param {object} p
 * @param {object|null} p.weapon     the Off-hand weapon's shape
 * @param {object|null} [p.turn]     readTurn() result
 * @param {object[]} [p.offered]     the followUps() list it came from
 * @returns {"light"|"dual-wielder"}
 */
export function offhandVia({ weapon = null, turn = null, offered = [] } = {}) {
  if (!weapon?.light) return "dual-wielder";
  if (turn?.nick || (offered ?? []).some(f => f?.kind === "nick")) return "dual-wielder";
  return "light";
}
