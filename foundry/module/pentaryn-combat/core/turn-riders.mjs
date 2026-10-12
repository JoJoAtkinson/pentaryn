/**
 * Pentaryn Combat core — once-per-turn riders (Sneak Attack and friends), Reckless Attack, the hint codes, an auto rider's dice.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

/**
 * The rider table. `needs` is what the rule asks of the weapon; `scale` is the ScaleValue the dice
 * come from (for the button label). Eligibility that needs judgement is a hint, never a refusal.
 */
export const TURN_RIDERS = Object.freeze([
  Object.freeze({ key: "sneak-attack", identifiers: Object.freeze(["sneak-attack"]), label: "Sneak Attack",
    needs: "finesse-or-ranged", scale: Object.freeze(["rogue", "sneak-attack"]), auto: true }),
  Object.freeze({ key: "frenzy", identifiers: Object.freeze(["frenzy"]), label: "Frenzy",
    needs: "strength", scale: Object.freeze(["barbarian", "rage-damage"]), dicePerScale: "d6", auto: true }),
  Object.freeze({ key: "colossus-slayer", identifiers: Object.freeze(["colossus-slayer"]), label: "Colossus Slayer",
    needs: "weapon", dice: "1d8", auto: false }),
  Object.freeze({ key: "divine-strike", identifiers: Object.freeze(["divine-strike"]), label: "Divine Strike",
    needs: "weapon", dice: "1d8", auto: true })
]);

export function riderByKey(key) {
  return TURN_RIDERS.find(r => r.key === key) ?? null;
}

/** The riders an actor has, by feature identity. */
export function ridersFor(features = []) {
  const feats = features instanceof Set ? features : new Set(features);
  return TURN_RIDERS.filter(r => r.identifiers.some(id => feats.has(id)));
}

/**
 * Can this rider ride on this attack? Never forced, never refused for something the GM judges.
 *
 * @param {object} p
 * @param {object} p.rider              a TURN_RIDERS row
 * @param {object} p.weapon             { finesse, ranged, melee }
 * @param {string} [p.attackMode]
 * @param {string} [p.ability]          the attack's ability
 * @param {object} [p.roll]             { advantage, disadvantage }
 * @param {boolean|null} [p.allyAdjacent]  null = unknown (no target / can't tell)
 * @param {boolean} [p.raging]
 * @param {boolean} [p.reckless]
 * @param {string|undefined} [p.used]   the turn flag's value for this rider
 * @returns {{offer: boolean, auto: boolean, checks: {key: string, ok: boolean|null}[]}}
 *   offer: the button may show; auto: auto mode may add the dice without asking.
 */
export function riderEligibility({ rider, weapon = {}, attackMode = null, ability = null, roll = {}, allyAdjacent = null,
  raging = false, reckless = false, used = undefined } = {}) {
  const none = { offer: false, auto: false, checks: [] };
  if (!rider || used) return none;
  // "a Finesse or a Ranged weapon": a thrown Melee weapon (Handaxe, Javelin) stays a Melee weapon —
  // Thrown makes a ranged *attack*, not a Ranged weapon. A thrown Dagger qualifies by Finesse.
  const ranged = !!weapon.ranged || attackMode === "ranged";
  const checks = [];
  if (rider.needs === "finesse-or-ranged") {
    if (!weapon.finesse && !ranged) return none;
    const adv = !!roll.advantage && !roll.disadvantage;
    const dis = !!roll.disadvantage && !roll.advantage;
    checks.push({ key: "advantage", ok: adv });
    checks.push({ key: "ally", ok: allyAdjacent });
    checks.push({ key: "noDisadvantage", ok: !dis });
    const auto = !dis && (adv || allyAdjacent === true);
    return { offer: true, auto, checks };
  }
  if (rider.needs === "strength") {
    if (ability && ability !== "str") return none;
    checks.push({ key: "raging", ok: !!raging });
    checks.push({ key: "reckless", ok: !!reckless });
    return { offer: true, auto: !!raging && !!reckless, checks };
  }
  return { offer: true, auto: !!rider.auto, checks };
}

/** "3d6" from a scale value's die count/faces, or the rider's fixed dice. */
export function riderDice(rider, scale = null) {
  if (!rider) return "";
  if (rider.dice) return rider.dice;
  if (rider.dicePerScale && Number.isFinite(Number(scale?.value ?? scale))) return `${Number(scale?.value ?? scale)}${rider.dicePerScale}`;
  if (scale?.formula) return scale.formula;
  if (scale?.number && scale?.faces) return `${scale.number}d${scale.faces}`;
  return "";
}

/**
 * A rider's own damage part with its die count as a parenthesised roll-data reference — the stock
 * Frenzy is "(@scale.barbarian.rage-damage)d6", which the card printed as "(2)d6". When the
 * reference resolves to a plain whole number, write it as "2d6". Anything else is left alone.
 * @param {string} part
 * @param {(ref: string) => any} resolve   "@scale.x.y" → its value
 */
export function tidyDiceCount(part, resolve = () => null) {
  if (typeof part !== "string") return part;
  return part.replace(/\((@[\w.-]+)\)d(\d+)/g, (whole, ref, faces) => {
    let v;
    try { v = resolve(ref); } catch { return whole; }
    const n = String(v ?? "").trim();
    return /^\d+$/.test(n) && Number(n) > 0 ? `${Number(n)}d${faces}` : whole;
  });
}

/**
 * 2024 Reckless Attack: Advantage on attack rolls using Strength until the start of your next turn.
 * The PHB item ships a "Reckless" effect with no changes and no activity to apply it, so nothing on
 * the HUD could turn it on. This is the native dnd5e 6 change that gives the Advantage (the dialog
 * then defaults to Advantage; Normal/Disadvantage stay one click away).
 */
export const RECKLESS_CHANGE = Object.freeze({ key: "system.abilities.str.attack.roll.mode", type: "add", value: 1 });

/** The stock effect's changes plus the Strength-attack Advantage when it isn't already there. */
export function recklessChanges(changes = []) {
  const list = (Array.isArray(changes) ? changes : []).filter(c => c && typeof c === "object").map(c => ({ ...c }));
  if (list.some(c => c.key === RECKLESS_CHANGE.key)) return list;
  return [...list, { ...RECKLESS_CHANGE }];
}

/** Is this effect a live Reckless Attack? (name "Reckless…", not disabled) */
export function isRecklessEffect(e) {
  return !!e && !e.disabled && !e.isSuppressed && /^reckless/i.test(String(e.name ?? ""));
}

/** Which hint lines a rider's checks produce: [{key, ok}] → ["advantage:yes", "ally:unknown", …]. */
export function hintCodes(checks = []) {
  return checks.map(c => `${c.key}:${c.ok === true ? "yes" : c.ok === false ? "no" : "unknown"}`);
}

/**
 * What an auto rider's dice rolled on the damage card it was added to (Area 3 re-run, B4: after Undo
 * the card still read "1d8 + 3 + 3d6 = 22" with nothing to say how much of it was the rider). The
 * rider's dice are the last part of the weapon's damage formula, so the match is the LAST die with
 * the rider's faces and its count, or twice its count (a Critical Hit doubles the dice).
 * @param {string} dice  the rider's dice as added ("3d6")
 * @param {{number: number, faces: number, total: number}[]} terms  the damage roll's dice, in order
 * @returns {{formula: string, total: number}|null}
 */
export function riderRolled(dice, terms = []) {
  const m = /^\s*(\d+)d(\d+)\s*$/i.exec(String(dice ?? ""));
  if (!m) return null;
  const n = Number(m[1]);
  const faces = Number(m[2]);
  const list = Array.isArray(terms) ? terms : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (Number(t?.faces) !== faces || ![n, 2 * n].includes(Number(t?.number))) continue;
    const total = Number(t.total);
    return Number.isFinite(total) ? { formula: `${t.number}d${faces}`, total } : null;
  }
  return null;
}
