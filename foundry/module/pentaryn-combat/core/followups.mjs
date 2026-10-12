/**
 * Pentaryn Combat core — follow-ups on the Bonus and Special bars, the Pole Strike gate, the duplicate off-hand slot.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

import { freshTurn } from "./turn.mjs";
import { lightTrigger, nickCapable, offhandCapable, partnerWeapon } from "./weapons.mjs";

/**
 * Follow-up buttons the actor qualifies for right now.
 *
 * @param {object} p
 * @param {object} p.turn           readTurn() result
 * @param {object[]} p.weapons      weapon shapes
 * @param {Set|string[]} p.features feature identities
 * @param {boolean} [p.enhancedDualWielding]
 * @param {boolean} [p.bonusFree=true]   the Bonus pip as Argon shows it
 * @param {number|null} [p.focus]        Monk Focus left (null = no Focus pool)
 * @param {string|null} [p.unarmedId]
 * @param {boolean} [p.isOwnTurn=true]
 * @param {string|null} [p.poleStrikeId]  the Polearm Master item (its Pole Strike attack), if any
 * @returns {{kind: string, weaponId?: string, count?: number, free?: boolean}[]}
 */
export function followUps({ turn, weapons = [], features = [], enhancedDualWielding = false, bonusFree = true,
  focus = null, unarmedId = null, isOwnTurn = true, poleStrikeId = null } = {}) {
  const t = turn ?? freshTurn("nocombat");
  const feats = features instanceof Set ? features : new Set(features);
  const out = [];
  if (!isOwnTurn) return out;
  const byId = new Map(weapons.map(w => [w.id, w]));
  const used = t.attackAction.weapons.map(id => byId.get(id)).filter(Boolean);
  const bonusOk = bonusFree && !t.bonusUsed;

  // Light (and Dual Wielder): after attacking with a Light weapon, a different qualifying weapon.
  // PHB 2024: the Light property gives ONE extra attack (Bonus Action); Nick moves that one into the
  // Attack action. Dual Wielder's Enhanced Dual Wielding is a SECOND, separate extra attack (Bonus
  // Action, any one-handed melee weapon). So: a Nick partner is preferred for the Light attack —
  // the same weapon Full Attack's plan (extraSwings) picks — and with Dual Wielder the Bonus-action
  // attack stays on offer next to Nick, preferably with a weapon other than the Nick one.
  const lightUsed = used.find(lightTrigger);
  if (lightUsed) {
    const nick = partnerWeapon(weapons, lightUsed.id, w => nickCapable(w, { enhancedDualWielding }));
    const offhandUsed = t.followUps.includes("offhand");
    const lightSpent = !!t.nick || (offhandUsed && !enhancedDualWielding);
    if (nick && !t.nick && !(offhandUsed && !enhancedDualWielding)) out.push({ kind: "nick", weaponId: nick.id, free: true });
    if (bonusOk && !offhandUsed && (enhancedDualWielding || (!lightSpent && !nick))) {
      const qualifies = w => offhandCapable(w, { enhancedDualWielding });
      const second = (nick && enhancedDualWielding
        ? partnerWeapon(weapons.filter(w => w.id !== nick.id), lightUsed.id, qualifies)
        : null) ?? partnerWeapon(weapons, lightUsed.id, qualifies);
      if (second) out.push({ kind: "offhand", weaponId: second.id });
    }
  }

  if (bonusOk && unarmedId) {
    // 2024 Monk: neither needs the Attack action first.
    if (feats.has("monks-focus") && (focus ?? 0) >= 1 && !t.followUps.includes("flurry")) {
      out.push({ kind: "flurry", weaponId: unarmedId, count: feats.has("heightened-focus") ? 3 : 2 });
    }
    if (feats.has("martial-arts") && !t.followUps.includes("martial-arts") && !t.followUps.includes("flurry")) {
      out.push({ kind: "martial-arts", weaponId: unarmedId, count: 1 });
    }
  }

  // Hew: right after a crit or a kill with a melee weapon — one attack with that same weapon.
  if (bonusOk && feats.has("great-weapon-master") && !t.followUps.includes("hew")) {
    const a = t.attackAction;
    const wid = (a.crit && a.critWeapon) || (a.kill && a.killWeapon) || null;
    const w = wid ? byId.get(wid) : null;
    if (w && w.melee) out.push({ kind: "hew", weaponId: w.id });
  }

  // Pole Strike (Polearm Master): after the Attack action with a Quarterstaff, Spear or Heavy+Reach
  // weapon, one attack with the weapon's other end as a Bonus Action (usability Area 3: 4 clicks
  // through the Use Feature drawer and its activity chooser → 1 button).
  if (bonusOk && poleStrikeId && !t.followUps.includes("pole-strike") && poleStrikeOpen({ turn: t, weapons })) {
    out.push({ kind: "pole-strike", weaponId: poleStrikeId });
  }
  return out;
}

/** Pole Strike is offered only after the Attack action was taken with a qualifying weapon. */
export function poleStrikeOpen({ turn, weapons = [] } = {}) {
  const byId = new Map(weapons.map(w => [w.id, w]));
  return (turn?.attackAction?.weapons ?? []).some(id => {
    const w = byId.get(id);
    if (!w) return false;
    return ["quarterstaff", "spear"].includes(w.baseItem) || (w.heavy && w.reach);
  });
}

/**
 * Argon's off-hand weapon-set slot on the Bonus bar: hidden while our "Off-hand: X" offers the same
 * weapon (U-2-8), and once the Light property's extra attack was made this turn (Nick, or the
 * Bonus-action off-hand attack) unless our Off-hand button offers that slot's weapon — the plain
 * slot invited a second, illegal off-hand attack (usability Area 3, B7).
 */
export function hideOffhandSlot({ turn = null, slotId = null, offered = [] } = {}) {
  if (!slotId) return false;
  const ids = new Set(offered ?? []);
  if (ids.has(slotId)) return true;
  const t = turn ?? {};
  return !!t.nick || (t.followUps ?? []).includes("offhand");
}
