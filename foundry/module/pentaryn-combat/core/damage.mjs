/**
 * Pentaryn Combat core — damage: TWF / GWM fallback bonuses, Steady Aim, damage at 0 HP.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

import { ATTACK_ACTION_KINDS } from "./turn.mjs";
import { MOVEMENT_KEYS } from "./turnflow.mjs";

/**
 * Extra damage parts for a weapon damage roll.
 *  Two-Weapon Fighting: the ability modifier back on an off-hand (Light) extra attack, when positive.
 *  Great Weapon Master: +PB on a Heavy weapon hit made as part of the Attack action on your turn.
 * @returns {{key: string, part: string}[]}
 */
export function damageBonuses({ features = [], weapon = {}, attackMode = null, mod = 0, isOwnTurn = true, kind = "main" } = {}) {
  const feats = features instanceof Set ? features : new Set(features);
  const out = [];
  const offhand = String(attackMode ?? "").endsWith("offhand");
  if (offhand && feats.has("two-weapon-fighting") && mod > 0) out.push({ key: "two-weapon-fighting", part: "@mod" });
  if (feats.has("great-weapon-master") && weapon.heavy && isOwnTurn && !offhand && ATTACK_ACTION_KINDS.includes(kind)) {
    out.push({ key: "great-weapon-master", part: "@prof" });
  }
  return out;
}

/**
 * Damage at 0 Hit Points (PHB 2024): any damage while at 0 HP is one Death Saving Throw failure, two
 * from a Critical Hit. "Massive" flags the instant-death cases for the GM (damage at 0 HP that equals
 * or exceeds the HP maximum; or the remainder past 0 HP doing so), which this never applies itself.
 * Temporary Hit Points absorb first. Characters only: a monster dies at 0 HP.
 * @returns {{failures: number|null, massive: boolean}}  failures = the new tally, or null for no change
 */
export function damageAtZero({ isCharacter = true, hp = 0, temp = 0, max = 0, amount = 0, failures = 0, critical = false } = {}) {
  const none = { failures: null, massive: false };
  const dmg = Number(amount) || 0;
  if (!isCharacter || dmg <= 0) return none;
  const through = dmg - Math.min(Math.max(0, Number(temp) || 0), dmg);
  if (through <= 0) return none;
  const hpNow = Number(hp) || 0;
  const hpMax = Number(max) || 0;
  if (hpNow > 0) return { failures: null, massive: hpMax > 0 && through - hpNow >= hpMax };
  const had = Number(failures) || 0;
  if (had >= 3) return none;
  return { failures: Math.min(3, had + (critical ? 2 : 1)), massive: hpMax > 0 && through >= hpMax };
}

/**
 * Steady Aim (PHB 2024): Advantage on your next attack roll this turn; your Speed is 0 until the end
 * of the turn. As native dnd5e 6 changes: every ability's attack roll mode +1 (the dialog then defaults
 * to Advantage), and each Speed set to 0.
 */
export function steadyAimChanges() {
  return [
    ...["str", "dex", "con", "int", "wis", "cha"].map(a => ({ key: `system.abilities.${a}.attack.roll.mode`, type: "add", value: 1 })),
    ...MOVEMENT_KEYS.map(k => ({ key: `system.attributes.movement.${k}`, type: "override", value: 0 }))
  ];
}

/**
 * Steady Aim after its attack: the Advantage is used, the Speed 0 lasts to the end of the turn. In
 * combat the effect keeps only its Speed changes (the turn-end sweep removes it); out of combat there
 * is no turn end, so it goes (null = delete).
 * @returns {object[]|null}
 */
export function steadyAimAfterAttack(changes = [], { inCombat = false } = {}) {
  if (!inCombat) return null;
  const left = (changes ?? []).filter(c => !/\.attack\.roll\.mode$/.test(c?.key ?? ""));
  return left.length ? left : null;
}
