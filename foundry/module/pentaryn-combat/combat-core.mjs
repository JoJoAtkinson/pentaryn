/**
 * Pentaryn Combat — the pure core.
 *
 * Nothing here touches Foundry: every function takes plain data (actor/weapon "shapes" built by the
 * Foundry-facing files) and returns plain data. `node test/run.mjs` imports this file bare, which is
 * itself the proof that it stays pure.
 *
 * What lives here:
 *   attackCount / extraSwings / planSequence     how many swings, with what, in which mode
 *   sequenceReducer                              the Full Attack state machine (start → swing → pause …)
 *   turnKey / readTurn / recordSwing / …         the once-per-turn flag on the actor
 *   pipState                                     what the Action pips show
 *   classifySwing                                what one attack roll spent (Action swing, Bonus, Nick …)
 *   followUps                                    the Bonus-bar buttons the actor qualifies for right now
 *   TURN_RIDERS / ridersFor / riderEligibility   Sneak Attack and friends: offer, hint, auto
 *   tidyDiceCount                                "(2)d6" → "2d6" on a rider's damage part
 *   recklessChanges / isRecklessEffect           Reckless Attack's effect (Special-bar toggle)
 *   damageBonuses                                Two-Weapon Fighting / Great Weapon Master (fallback path)
 *   parseMultiattack                             NPC / Wild Shape Multiattack text → a swing plan
 *   weaponSetSeed                                Argon's weapon set 1/2 for a PC whose flag is empty
 */

export const MOD = "pentaryn-combat";

/* ── names and identity ───────────────────────────────────────────────────── */

/** "Extra Attack (Fighter)" → "extra attack"; curly apostrophes straightened, spaces collapsed. */
export function normalizeName(name) {
  return String(name ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "Great Weapon Master" → "great-weapon-master" (dnd5e's identifier slug, for hand-made items). */
export function slugify(name) {
  return normalizeName(name).replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Every identity an actor's features answer to: their identifiers plus their slugged names. */
export function featureSet(features = []) {
  const out = new Set();
  for (const f of features) {
    if (f?.identifier) out.add(f.identifier);
    if (f?.name) out.add(slugify(f.name));
  }
  return out;
}

/* ── attack count ─────────────────────────────────────────────────────────── */

const EXTRA_ATTACK = Object.freeze([
  ["three-extra-attacks", 4],
  ["two-extra-attacks", 3],
  ["extra-attack", 2]
]);

/**
 * How many swings the Attack action gives with this weapon. Highest wins, never summed across
 * classes (the rule is "attack twice", not "+1").
 *
 * @param {object} actor   { features: Set|string[], override?: number, multiattack?: {total} }
 * @param {object} [weapon] { pactWeapon?: bool, ability?: string, loading?: bool }
 */
export function attackCount(actor = {}, weapon = null) {
  const override = Number(actor.override);
  if (Number.isInteger(override) && override >= 1) return override;
  const feats = actor.features instanceof Set ? actor.features : new Set(actor.features ?? []);
  let n = 1;
  for (const [id, count] of EXTRA_ATTACK) if (feats.has(id)) { n = Math.max(n, count); break; }
  if (feats.has("thirsting-blade") && weapon && (weapon.pactWeapon || weapon.ability === "cha")) n = Math.max(n, 2);
  if (actor.multiattack?.total >= 2) n = Math.max(n, actor.multiattack.total);
  // Loading (2024 PHB): one piece of ammunition per action, "regardless of the number of attacks you
  // can normally make" — unless Crossbow Expert ignores Loading. NPC Multiattack text already says.
  if (weapon?.loading && !feats.has("crossbow-expert") && !(actor.multiattack?.total >= 2)) n = 1;
  return n;
}

/* ── weapons ──────────────────────────────────────────────────────────────── */

/**
 * The shape every function here reads a weapon as (built by combat.mjs `weaponShape`):
 * { id, name, img, equipped, melee, ranged, light, heavy, twoHanded, finesse, reach, thrown,
 *   versatile, mastery, hasMastery, baseItem, activation, attackActivity, natural, unarmed }
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
 * A Full Attack's swing list.
 * @param {object} p
 * @param {string} p.weaponId            the main weapon
 * @param {number} p.count               attackCount for it
 * @param {number} [p.done=0]            main swings already taken this turn
 * @param {object[]} [p.extras=[]]       extraSwings() result, appended after the main swings
 * @param {object[]} [p.multiattack]     NPC plan [{itemId, count}] — replaces weapon/count
 * @returns {{weaponId: string, mode: string|null, kind: string}[]}
 */
export function planSequence({ weaponId = null, count = 1, done = 0, extras = [], multiattack = null } = {}) {
  const out = [];
  if (Array.isArray(multiattack) && multiattack.length) {
    for (const g of multiattack) for (let i = 0; i < (g.count ?? 0); i++) out.push({ weaponId: g.itemId, mode: null, kind: "main" });
    return out.slice(Math.max(0, done));
  }
  if (!weaponId) return [];
  const left = Math.max(0, count - Math.max(0, done));
  for (let i = 0; i < left; i++) out.push({ weaponId, mode: null, kind: "main" });
  for (const x of extras) out.push({ weaponId: x.weaponId, mode: x.mode ?? "offhand", kind: x.kind ?? "nick" });
  return out;
}

/* ── the Full Attack state machine ────────────────────────────────────────── */

/**
 * The sequence state. Pure transitions; sequence.mjs drives the rolls.
 *   status: "running" | "paused" | "done" | "stopped"
 *   index:  the swing about to be rolled (0-based); swings before it are rolled
 *   swings: [{weaponId, mode, kind, result?: "rolled"}]
 *   adv:    null | "advantage" | "disadvantage"  — the strip's toggle for the NEXT swing
 */
export function sequenceReducer(state, action) {
  switch (action?.type) {
    case "start": {
      const swings = (action.swings ?? []).map(s => ({ ...s }));
      return { status: swings.length ? "running" : "done", index: 0, swings, adv: null, rolled: 0 };
    }
    case "rolled": {
      if (!state || state.status !== "running") return state;
      const swings = state.swings.map((s, i) => (i === state.index ? { ...s, result: "rolled", crit: !!action.crit } : s));
      const index = state.index + 1;
      return { ...state, swings, index, rolled: state.rolled + 1, adv: null, status: index >= swings.length ? "done" : "running" };
    }
    case "cancel":   // the attack dialog was closed: pause on this swing, nothing spent
      if (!state || state.status !== "running") return state;
      return { ...state, status: "paused" };
    case "resume":
      if (!state || state.status !== "paused") return state;
      return { ...state, status: "running" };
    case "adv": {
      if (!state || (state.status !== "running" && state.status !== "paused")) return state;
      const v = action.value === state.adv ? null : action.value;
      return { ...state, adv: v === "advantage" || v === "disadvantage" ? v : null };
    }
    case "swap": {     // a different weapon for every MAIN swing not yet rolled
      if (!state || (state.status !== "running" && state.status !== "paused") || !action.weaponId) return state;
      const swings = state.swings.map((s, i) => (i >= state.index && s.kind === "main" ? { ...s, weaponId: action.weaponId, mode: null } : s));
      return { ...state, swings };
    }
    case "stop":
      if (!state || state.status === "done") return state;
      return { ...state, status: "stopped" };
    default:
      return state;
  }
}

/** "Swing 2 of 3" numbers for the strip. */
export function stripNumbers(state) {
  if (!state) return null;
  const n = state.swings.length;
  return { current: Math.min(state.index + 1, n), total: n, left: Math.max(0, n - state.index) };
}

/* ── the turn flag ────────────────────────────────────────────────────────── */

/** The key that makes the flag self-invalidating: a different key = a fresh turn, no reset write. */
export function turnKey({ combatId = null, round = null, turn = null, inCombat = false } = {}) {
  if (!inCombat || !combatId) return "nocombat";
  return `${combatId}:${round ?? 0}:${turn ?? 0}`;
}

/**
 * Which combat an actor is fighting in. `game.combat` is only the combat this client is VIEWING in
 * the tracker, and any GM "Activate" of another encounter flips every client's view to it — so a
 * Wild Shape bear's swings were counted under "nocombat" while its own combat ran (pips stuck at 2).
 * Prefer the viewed combat when it holds the actor, then an active one on the actor's scene, then
 * any active one, then one on its scene, then the first. Only started combats that hold it count.
 *
 * @param {{id: string, started: boolean, holds: boolean, active?: boolean, onScene?: boolean}[]} combats
 * @param {{viewedId?: string|null}} [o]
 * @returns {string|null}
 */
export function pickCombat(combats = [], { viewedId = null } = {}) {
  const mine = (combats ?? []).filter(c => c && c.started && c.holds);
  if (!mine.length) return null;
  const hit = mine.find(c => c.id === viewedId) ?? mine.find(c => c.active && c.onScene) ?? mine.find(c => c.active)
    ?? mine.find(c => c.onScene) ?? mine[0];
  return hit.id;
}

export function freshTurn(key) {
  return {
    key,
    attackAction: { weapons: [], swings: 0, crit: false, critWeapon: null, kill: false, killWeapon: null },
    riders: {},
    followUps: [],
    nick: false,
    bonusUsed: false,
    otherAction: false,   // kept for readers of older flags; otherActions is the count
    otherActions: 0,      // non-Attack Actions taken this turn (Magic, Dash via an item, a spell attack…)
    surges: 0             // Action Surge uses this turn: each is one more Action
  };
}

/** The flag as stored, or a fresh turn if it belongs to another turn (or is missing/garbled). */
export function readTurn(flag, key) {
  if (!flag || typeof flag !== "object" || flag.key !== key) return freshTurn(key);
  const base = freshTurn(key);
  return {
    ...base,
    ...flag,
    attackAction: { ...base.attackAction, ...(flag.attackAction ?? {}) },
    riders: { ...(flag.riders ?? {}) },
    followUps: [...(flag.followUps ?? [])]
  };
}

/**
 * What one attack roll spent.
 * @returns {"main"|"nick"|"offhand"|"bonus"|"reaction"|"other"}
 */
export function classifySwing({ tagged = null, activation = "action", attackMode = null, isOwnTurn = true, inCombat = false } = {}) {
  if (tagged) return tagged;
  if (inCombat && !isOwnTurn) return "reaction";
  if (String(attackMode ?? "").endsWith("offhand")) return "offhand";
  if (activation === "bonus") return "bonus";
  if (activation === "reaction") return "reaction";
  if (activation === "action" || !activation) return "main";
  return "other";
}

/** The turn after one attack roll. */
export function recordSwing(turn, { kind, weaponId = null, crit = false, melee = true } = {}) {
  const t = readTurn(turn, turn?.key);
  const a = { ...t.attackAction, weapons: [...t.attackAction.weapons] };
  if (kind === "main" || kind === "nick") {
    if (kind === "main") a.swings += 1;
    if (weaponId && !a.weapons.includes(weaponId)) a.weapons.push(weaponId);
  }
  if (crit && melee && kind !== "reaction") { a.crit = true; a.critWeapon = weaponId; }
  const next = { ...t, attackAction: a };
  if (kind === "nick") next.nick = true;
  if (kind === "offhand") { next.bonusUsed = true; if (!next.followUps.includes("offhand")) next.followUps = [...next.followUps, "offhand"]; }
  if (kind === "bonus") next.bonusUsed = true;
  return next;
}

/** A follow-up button was used (Flurry, Martial Arts, Hew, Pole Strike…). */
export function recordFollowUp(turn, kind, { bonus = true } = {}) {
  const t = readTurn(turn, turn?.key);
  return { ...t, bonusUsed: bonus ? true : t.bonusUsed, followUps: t.followUps.includes(kind) ? t.followUps : [...t.followUps, kind] };
}

/** A creature one of this turn's swings hit dropped to 0 HP. */
export function recordKill(turn, weaponId) {
  const t = readTurn(turn, turn?.key);
  return { ...t, attackAction: { ...t.attackAction, kill: true, killWeapon: weaponId ?? t.attackAction.killWeapon } };
}

/** Non-Attack Actions taken this turn (an older flag's `otherAction: true` reads as one). */
export function otherActionsOf(turn) {
  const n = Number(turn?.otherActions);
  if (Number.isFinite(n) && n > 0) return n;
  return turn?.otherAction ? 1 : 0;
}

/** A non-attack Action (Magic, Dash, a spell attack…) spends one Action's worth of swings. */
export function recordOtherAction(turn) {
  const t = readTurn(turn, turn?.key);
  return { ...t, otherAction: true, otherActions: otherActionsOf(t) + 1 };
}

/** Action Surge: one more Action this turn (2024: "one additional action, except the Magic action"). */
export function recordSurge(turn) {
  const t = readTurn(turn, turn?.key);
  return { ...t, surges: (Number(t.surges) || 0) + 1 };
}

/** Actions this turn that can still be the Attack action: 1 + Action Surges − other Actions taken. */
export function attackActions(turn) {
  return Math.max(0, 1 + (Number(turn?.surges) || 0) - otherActionsOf(turn));
}

/** Rider bookkeeping: "used", "auto:<messageId>", or cleared (Undo). */
export function setRider(turn, key, value) {
  const t = readTurn(turn, turn?.key);
  const riders = { ...t.riders };
  if (value === null || value === undefined) delete riders[key];
  else riders[key] = value;
  return { ...t, riders };
}

/**
 * Main swings left this turn: `count` per Action that can still be the Attack action (Action Surge
 * adds one), minus the swings already made. Out of combat the count is never spent.
 */
export function swingsLeft(count, turn, { inCombat = false } = {}) {
  if (!inCombat) return count;
  if (!turn) return count;
  return Math.max(0, count * attackActions(turn) - (turn.attackAction?.swings ?? 0));
}

/**
 * What the Action pips show. Argon shows none out of combat (max null), so neither do we.
 * Action Surge widens the row (2 → 4 pips for a Fighter 5).
 * @returns {{max: number|null, current: number|null}}
 */
export function pipState({ count = 1, turn = null, inCombat = false } = {}) {
  if (!inCombat) return { max: null, current: null };
  return { max: count * (1 + (Number(turn?.surges) || 0)), current: swingsLeft(count, turn, { inCombat }) };
}

/* ── follow-ups on the Bonus bar ──────────────────────────────────────────── */

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
 * @returns {{kind: string, weaponId?: string, count?: number, free?: boolean}[]}
 */
export function followUps({ turn, weapons = [], features = [], enhancedDualWielding = false, bonusFree = true,
  focus = null, unarmedId = null, isOwnTurn = true } = {}) {
  const t = turn ?? freshTurn("nocombat");
  const feats = features instanceof Set ? features : new Set(features);
  const out = [];
  if (!isOwnTurn) return out;
  const byId = new Map(weapons.map(w => [w.id, w]));
  const used = t.attackAction.weapons.map(id => byId.get(id)).filter(Boolean);
  const bonusOk = bonusFree && !t.bonusUsed;

  // Light (and Dual Wielder): after attacking with a Light weapon, a different qualifying weapon.
  const lightUsed = used.find(lightTrigger);
  if (lightUsed && !t.followUps.includes("offhand") && !t.nick) {
    const second = partnerWeapon(weapons, lightUsed.id, w => offhandCapable(w, { enhancedDualWielding }));
    if (second) {
      if (nickCapable(second, { enhancedDualWielding })) out.push({ kind: "nick", weaponId: second.id, free: true });
      else if (bonusOk) out.push({ kind: "offhand", weaponId: second.id });
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

/* ── once-per-turn riders ─────────────────────────────────────────────────── */

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

/* ── Reckless Attack ──────────────────────────────────────────────────────── */

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

/* ── always-on weapon damage riders (fallback for native rule effects) ────── */

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
  if (feats.has("great-weapon-master") && weapon.heavy && isOwnTurn && !offhand && (kind === "main" || kind === "nick")) {
    out.push({ key: "great-weapon-master", part: "@prof" });
  }
  return out;
}

/* ── NPC / Wild Shape Multiattack ─────────────────────────────────────────── */

const NUMBER_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, once: 1, twice: 2 });

function numberOf(word) {
  const w = String(word ?? "").toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? null;
}

/**
 * Multiattack text → a swing plan.
 *
 * Handles what dnd5e's 2024 MM and this world's homebrew write:
 *   "makes two [[/item .id]] attacks"
 *   "makes one [[/item .a]] attack and one [[/item .b]] attack" / "… and two [[/item Tail]] attacks"
 *   "makes three attacks, using [[/item .a]] or [[/item .b]] in any combination"
 *   "makes two [[/item .a]] or [[/item .b]] attacks"
 *   "makes a number of [[/item Slam]] attacks equal to half this spell's level … [[floor(@x / 2)]]{…}"
 *   "makes one Slam attack and uses Pacifying Spores"  (bare names)
 * "It can replace one attack with …" and "… uses [[/item X]]" (non-attacks) are ignored.
 *
 * @param {string} description            the item's description HTML
 * @param {{id: string, name: string, isAttack: boolean}[]} items  the actor's items
 * @param {object} [opts]
 * @param {(formula: string) => number|null} [opts.evalFormula]  for the summon-level formula
 * @returns {{total: number, groups: {count: number, choices: string[]}[], formula?: string}|null}
 */
export function parseMultiattack(description, items = [], { evalFormula = null } = {}) {
  if (!description) return null;
  const attacks = items.filter(i => i.isAttack);
  const byId = new Map(items.map(i => [i.id, i]));
  const byName = new Map(items.map(i => [normalizeName(i.name), i]));

  let text = String(description)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/\[\[lookup[^\]]*\]\]/gi, "it");

  // The summon-level count, then any other inline roll.
  let formula = null;
  text = text.replace(/\[\[(?!\/)([^\]]+)\]\](\{[^}]*\})?/g, (_, f) => { formula ??= f.trim(); return " "; });

  // Links → ⟦id⟧ tokens (⟦-⟧ for a link that is not one of the actor's attack items).
  text = text.replace(/\[\[\/item\s+([^\]]+)\]\](\{[^}]*\})?/gi, (_, ref) => {
    const r = ref.trim();
    if (/\.Activity\./i.test(r)) return "⟦-⟧";
    const item = r.startsWith(".") ? byId.get(r.slice(1).split(".")[0]) : byName.get(normalizeName(r));
    return item && item.isAttack ? `⟦${item.id}⟧` : "⟦-⟧";
  });
  // Bare attack names ("one Slam attack"), longest first so "Light Crossbow" beats "Crossbow".
  for (const a of [...attacks].sort((x, y) => y.name.length - x.name.length)) {
    const esc = a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(?<![⟦\\w])${esc}(?=\\s+attacks?\\b)`, "gi"), `⟦${a.id}⟧`);
  }
  text = text.replace(/\s+/g, " ").trim();

  // Only the sentence that says what it makes; "It can replace one attack…" is a later sentence.
  const sentence = (text.match(/makes[^.]*\./i) ?? text.match(/makes.*/i))?.[0] ?? "";
  if (!sentence) return null;

  const ids = s => [...s.matchAll(/⟦([^⟧]+)⟧/g)].map(m => m[1]).filter(id => id !== "-");

  // a number of [X] attacks equal to …
  if (/a number of/i.test(sentence)) {
    const m = sentence.match(/a number of\s+((?:⟦[^⟧]+⟧\s*)?)attacks/i);
    if (!m) return null;
    let choices = ids(m[1]);
    if (!choices.length && attacks.length === 1) choices = [attacks[0].id];
    if (!choices.length || !formula) return null;
    const n = evalFormula ? evalFormula(formula) : null;
    const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
    if (count === null) return { total: 0, groups: [{ count: 0, choices }], formula };
    return { total: count, groups: [{ count, choices }], formula };
  }

  // N attacks, using [A] or/and [B] (in any combination)
  const anyCombo = sentence.match(/makes\s+(\w+)\s+attacks?\s*,?\s*using\s+(.*?)(?:\s+in any combination|\.|$)/i);
  if (anyCombo) {
    const count = numberOf(anyCombo[1]);
    const choices = ids(anyCombo[2]);
    if (!count || !choices.length) return null;
    return { total: count, groups: [{ count, choices }] };
  }

  // one or more "N [A] (or [B]) attack(s)" groups
  const groups = [];
  const re = /\b(\w+)\s+((?:⟦[^⟧]+⟧(?:\s*,?\s*(?:or|and)\s*)?)+)\s*attacks?\b/gi;
  let prevEnd = null;
  for (const m of sentence.matchAll(re)) {
    const count = numberOf(m[1]);
    const choices = ids(m[2]);
    if (!count || !choices.length) continue;
    // "two [A] attacks or two [B] attacks" is one choice of two swings, not four swings.
    const gap = prevEnd === null ? "" : sentence.slice(prevEnd, m.index);
    const last = groups[groups.length - 1];
    if (last && /^\s*,?\s*or\s*$/i.test(gap)) {
      last.count = Math.max(last.count, count);
      for (const c of choices) if (!last.choices.includes(c)) last.choices.push(c);
    } else {
      groups.push({ count, choices });
    }
    prevEnd = m.index + m[0].length;
  }
  if (groups.length) return { total: groups.reduce((s, g) => s + g.count, 0), groups };

  // "makes two attacks" with no item named: only if the creature has exactly one attack.
  const bare = sentence.match(/makes\s+(\w+)\s+attacks?\b/i);
  const count = bare ? numberOf(bare[1]) : null;
  if (count && attacks.length === 1) return { total: count, groups: [{ count, choices: [attacks[0].id] }] };
  return null;
}

/** The default plan of a parsed Multiattack: each group's first choice, count times. */
export function multiattackPlan(parsed, { pick = {} } = {}) {
  if (!parsed?.groups?.length) return null;
  // pick[i] picks for group i; pick["*"] (the remembered weapon) for every group that offers it —
  // the HUD's picker shows the first group with a choice, which need not be group 0.
  return parsed.groups.map((g, i) => {
    const want = (pick[i] && g.choices.includes(pick[i])) ? pick[i] : (pick["*"] && g.choices.includes(pick["*"]) ? pick["*"] : null);
    return { itemId: want ?? g.choices[0], count: g.count };
  });
}

/** A stored override `[{item, count}]` → a plan, against the actor's item ids. */
export function overridePlan(flag, itemIds = []) {
  if (!Array.isArray(flag)) return null;
  const known = new Set(itemIds);
  const plan = flag
    .map(r => ({ itemId: r?.item ?? r?.itemId, count: Number(r?.count) }))
    .filter(r => known.has(r.itemId) && Number.isInteger(r.count) && r.count > 0);
  return plan.length ? plan : null;
}

/* ── Argon weapon sets for a PC with none ─────────────────────────────────── */

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

/* ── the hint text pieces ─────────────────────────────────────────────────── */

/** Which hint lines a rider's checks produce: [{key, ok}] → ["advantage:yes", "ally:unknown", …]. */
export function hintCodes(checks = []) {
  return checks.map(c => `${c.key}:${c.ok === true ? "yes" : c.ok === false ? "no" : "unknown"}`);
}
