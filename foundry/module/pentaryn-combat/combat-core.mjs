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
 *   specialActionOf / actionsLeft / dashChanges  Argon's Dash, Disengage, Dodge, Hide, Ready, Shove (turnflow.mjs)
 *   expiringAt                                   Dodge / Dash / Disengage ending at a turn boundary
 *   damageAtZero                                 a Death Saving Throw failure for damage taken at 0 HP
 *   portraitExtras / orphanUsage                 conditions on the HUD portrait; a cancelled attack's empty card
 *   pipFor / spentPips / reactionSpent           which pip a spell or feature spends; Quickened Spell
 *   hudFollowPlan / offhandVia / deltasConsumed  HUD follow at combat start; which rule an Off-hand is; a used card
 *   riderRolled                                  what an auto rider's dice came to on its damage card (Undo)
 */

/* ── identity (blueprint constants; one MODULE for every file) ──────────────── */

export const MODULE = "pentaryn-combat";
export { MODULE as MOD };                  // game.pentaryn.combat.core.MOD stays readable for macros
export const SHORT = "combat";
export const NS = "combat";                // game.pentaryn.combat
export const VERSION = "0.2.5";            // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-combat/api@1";
export const I18N = "PENTARYN_COMBAT";
export const CSS = "pc-";
/**
 * Every i18n key the code used to build from a template (FollowUp + "." + kind), written
 * out literally so each one is a definite reference for the i18n gate (C35, combat-riders-28). Read
 * through `keyFor(family, value)`, which falls back to the old template's string for a value the
 * table lacks, so the rendered text is unchanged either way.
 */
export const I18N_KEYS = Object.freeze({
  FollowUp: Object.freeze({
    offhand: "PENTARYN_COMBAT.FollowUp.offhand",
    nick: "PENTARYN_COMBAT.FollowUp.nick",
    flurry: "PENTARYN_COMBAT.FollowUp.flurry",
    "martial-arts": "PENTARYN_COMBAT.FollowUp.martial-arts",
    hew: "PENTARYN_COMBAT.FollowUp.hew",
    "pole-strike": "PENTARYN_COMBAT.FollowUp.pole-strike",
  }),
  FollowUpText: Object.freeze({
    offhand: "PENTARYN_COMBAT.FollowUpText.offhand",
    "offhand-dual-wielder": "PENTARYN_COMBAT.FollowUpText.offhand-dual-wielder",
    nick: "PENTARYN_COMBAT.FollowUpText.nick",
    flurry: "PENTARYN_COMBAT.FollowUpText.flurry",
    "martial-arts": "PENTARYN_COMBAT.FollowUpText.martial-arts",
    hew: "PENTARYN_COMBAT.FollowUpText.hew",
    "pole-strike": "PENTARYN_COMBAT.FollowUpText.pole-strike",
  }),
  Kind: Object.freeze({
    nick: "PENTARYN_COMBAT.Kind.nick",
    offhand: "PENTARYN_COMBAT.Kind.offhand",
    bonus: "PENTARYN_COMBAT.Kind.bonus",
    main: "PENTARYN_COMBAT.Kind.main",
    "pole-strike": "PENTARYN_COMBAT.Kind.pole-strike",
  }),
  "Rider.Name": Object.freeze({
    "sneak-attack": "PENTARYN_COMBAT.Rider.Name.sneak-attack",
    frenzy: "PENTARYN_COMBAT.Rider.Name.frenzy",
    "colossus-slayer": "PENTARYN_COMBAT.Rider.Name.colossus-slayer",
    "divine-strike": "PENTARYN_COMBAT.Rider.Name.divine-strike",
  }),
  "Rider.Rule": Object.freeze({
    "sneak-attack": "PENTARYN_COMBAT.Rider.Rule.sneak-attack",
    frenzy: "PENTARYN_COMBAT.Rider.Rule.frenzy",
    "colossus-slayer": "PENTARYN_COMBAT.Rider.Rule.colossus-slayer",
    "divine-strike": "PENTARYN_COMBAT.Rider.Rule.divine-strike",
  }),
  "Rider.Check": Object.freeze({
    advantage: "PENTARYN_COMBAT.Rider.Check.advantage",
    ally: "PENTARYN_COMBAT.Rider.Check.ally",
    noDisadvantage: "PENTARYN_COMBAT.Rider.Check.noDisadvantage",
    raging: "PENTARYN_COMBAT.Rider.Check.raging",
    reckless: "PENTARYN_COMBAT.Rider.Check.reckless",
  }),
  "Rider.Mode": Object.freeze({
    ask: "PENTARYN_COMBAT.Rider.Mode.ask",
    auto: "PENTARYN_COMBAT.Rider.Mode.auto",
  }),
  "Rider.ToggleHint": Object.freeze({
    ask: "PENTARYN_COMBAT.Rider.ToggleHint.ask",
    auto: "PENTARYN_COMBAT.Rider.ToggleHint.auto",
  }),
  "Reckless.State": Object.freeze({
    on: "PENTARYN_COMBAT.Reckless.State.on",
    off: "PENTARYN_COMBAT.Reckless.State.off",
  }),
  "Reckless.Hint": Object.freeze({
    on: "PENTARYN_COMBAT.Reckless.Hint.on",
    off: "PENTARYN_COMBAT.Reckless.Hint.off",
  }),
  "Strip.Action": Object.freeze({
    normal: "PENTARYN_COMBAT.Strip.Action.normal",
    advantage: "PENTARYN_COMBAT.Strip.Action.advantage",
    disadvantage: "PENTARYN_COMBAT.Strip.Action.disadvantage",
    critical: "PENTARYN_COMBAT.Strip.Action.critical",
  }),
  "Strip.PausedNote": Object.freeze({
    main: "PENTARYN_COMBAT.Strip.PausedNote.main",
    flurry: "PENTARYN_COMBAT.Strip.PausedNote.flurry",
    bonus: "PENTARYN_COMBAT.Strip.PausedNote.bonus",
  }),
  "Turn.Effect": Object.freeze({
    dash: "PENTARYN_COMBAT.Turn.Effect.dash",
    disengage: "PENTARYN_COMBAT.Turn.Effect.disengage",
  }),
  "Turn.EffectText": Object.freeze({
    dash: "PENTARYN_COMBAT.Turn.EffectText.dash",
    disengage: "PENTARYN_COMBAT.Turn.EffectText.disengage",
  }),
});

/** `I18N_KEYS[family][value]`, else the key the template used to build (same string, so the same text). */
export function keyFor(family, value) {
  return I18N_KEYS[family]?.[value] ?? `${I18N}.${family}.${value}`;
}

/** The module's own events (S9 fills it): `{ name, pre, args, legacyName?, until? }` rows, fired by ctx.emit. */
export const HOOKS = Object.freeze({});

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
      const mainLeft = state.swings.some((s, i) => i >= state.index && s.kind === "main");
      const swings = state.swings.map((s, i) => (i >= state.index && s.kind === "main" ? { ...s, weaponId: action.weaponId, mode: null } : s));
      // `extras` (Area 10): the Nick swing the new main weapon earns replaces the planned one.
      return { ...state, swings: mainLeft ? replanExtras({ ...state, swings }, action.extras ?? null) : swings };
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
    surges: 0,            // Action Surge uses this turn: each is one more Action
    quickened: false      // Quickened Spell used: the next 1-Action spell is the Bonus Action
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

/**
 * A Bonus-action feature that is not an attack (Rage, Steady Aim, Divine Smite, Lay on Hands, a
 * Bonus-action spell) spent this turn's Bonus Action. Argon spends its pip only for buttons bound to
 * an activity; an item button (most features) ran `item.use()` and spent nothing (usability Area 3).
 */
export function recordBonusAction(turn) {
  const t = readTurn(turn, turn?.key);
  return { ...t, bonusUsed: true };
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

/* ── turn flow (Area 1 re-run): Argon's special actions, expiry, death saves, portrait ───── */

/** Argon dnd5e's six built-in action buttons, by key. */
export const SPECIAL_ACTIONS = Object.freeze(["dash", "disengage", "dodge", "hide", "ready", "shove"]);

/**
 * Which special action a button is, from its label and the localized names ({dash: "Dash", …}).
 * @returns {string|null}
 */
export function specialActionOf(label, names = {}) {
  const l = normalizeName(label ?? "");
  if (!l) return null;
  for (const key of SPECIAL_ACTIONS) if (normalizeName(names?.[key] ?? key) === l) return key;
  return null;
}

/**
 * Actions still free this turn: 1 + Action Surges, minus other Actions taken, minus Attack actions
 * begun (a Fighter 5 who swung once has begun one Attack action: `count` = 2 swings per action).
 */
export function actionsLeft(turn, count = 1) {
  const swings = Number(turn?.attackAction?.swings) || 0;
  const per = Math.max(1, Number(count) || 1);
  return Math.max(0, 1 + (Number(turn?.surges) || 0) - otherActionsOf(turn) - Math.ceil(swings / per));
}

/** The turn after a special action: Shove (2024: an Unarmed Strike option) is one swing, the rest an Action. */
export function recordSpecialAction(turn, kind) {
  if (kind === "shove") return recordSwing(turn, { kind: "main", melee: true });
  return recordOtherAction(turn);
}

/**
 * Dash (PHB 2024): extra movement this turn equal to your Speed after modifiers; a Fly or Swim Speed
 * may be used instead, so every speed above 0 gets its own value added.
 * @param {object} movement  system.attributes.movement (prepared)
 */
export function dashChanges(movement = {}) {
  const out = [];
  for (const k of ["walk", "fly", "swim", "climb", "burrow"]) {
    const v = Number(movement?.[k]);
    if (Number.isFinite(v) && v > 0) out.push({ key: `system.attributes.movement.${k}`, type: "add", value: v });
  }
  return out;
}

/**
 * Effect ids to remove at one of an actor's turn boundaries. Dodge (status "dodging", however it was
 * applied) and Reckless Attack last until the start of your next turn; our Dash and Disengage effects
 * carry `until: "turnEnd"` (the current turn only). Each kind is swept only while its setting is on.
 * @param {{id: string, statuses?: string[], until?: string|null, reckless?: boolean}[]} effects
 * @param {"turnStart"|"turnEnd"} event
 * @param {{specialActions?: boolean, reckless?: boolean}} [on]  settings specialActions / recklessToggle
 */
export function expiringAt(effects = [], event, { specialActions = true, reckless = true } = {}) {
  return (effects ?? []).filter(e => e && (e.reckless ? reckless : specialActions) && (
    (event === "turnStart" && (e.statuses ?? []).includes("dodging"))
    // Reckless Attack lasts "until the start of your next turn" (PHB 2024). Its effect was left on
    // the actor at 0 rounds (Area 3 re-run, D1): any Reckless effect on the actor goes at turn start.
    || (event === "turnStart" && !!e.reckless)
    || (!!e.until && e.until === event)
  )).map(e => e.id);
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
 * Effects the HUD portrait should show beyond Argon's own (it lists `temporaryEffects`, and v14 no
 * longer counts a status-only effect such as Prone or Poisoned as temporary).
 * @param {{uuid: string, active: boolean, temporary: boolean, concealed?: boolean, statuses?: string[]}[]} effects
 * @returns {string[]} uuids
 */
export function portraitExtras(effects = []) {
  return (effects ?? []).filter(e => e && e.active && !e.temporary && !e.concealed && (e.statuses ?? []).length).map(e => e.uuid);
}

/**
 * A usage card left behind by a cancelled attack roll: posted by this user moments ago, nothing rolled
 * under it, nothing consumed, no sequence still threading swings under it.
 */
export function orphanUsage({ mine = false, ageMs = Infinity, rolled = true, consumed = true, sequence = false } = {}) {
  return !!mine && ageMs >= 0 && ageMs < 5 * 60 * 1000 && !rolled && !consumed && !sequence;
}

/* ── usability run, Area 2 (fixer pass 2) ─────────────────────────────────── */

/**
 * What the Full Attack tooltip says about a plan: main swings left of the Attack action's count, and
 * the extra swings (Nick) by weapon, so a Nick pair reads "2 of 2 swings left, + Nick: Dagger" and
 * never "3 of 2".
 * @param {{weaponId: string, kind: string}[]} swings  fullAttackPlan().swings
 * @param {number} count                               the Attack action's swings
 * @returns {{left: number, total: number, mainIds: string[], extras: {kind: string, weaponId: string}[]}}
 */
export function planSummary(swings = [], count = 0) {
  const list = Array.isArray(swings) ? swings.filter(Boolean) : [];
  const main = list.filter(s => (s.kind ?? "main") === "main");
  return {
    left: main.length,
    total: Math.max(Number(count) || 0, main.length),
    mainIds: [...new Set(main.map(s => s.weaponId).filter(Boolean))],
    extras: list.filter(s => (s.kind ?? "main") !== "main").map(s => ({ kind: s.kind, weaponId: s.weaponId }))
  };
}

/**
 * Where a roll window goes while a Full Attack runs: its bottom edge just above the swing strip, so
 * the strip (Adv / Dis / Quick / Stop) is never under it and the window's buttons sit at the same
 * height for every swing, however tall the window is. A window the player dragged sets `last`
 * (its left and bottom edge) for the next ones. Clamped to the viewport.
 * @returns {{left: number, top: number}}
 */
export function dockRect({ stripTop = null, height = 0, width = 0, viewW = 0, viewH = 0, gap = 8, last = null } = {}) {
  const h = Math.max(0, Number(height) || 0);
  const w = Math.max(0, Number(width) || 0);
  const bottom = Number.isFinite(last?.bottom) ? last.bottom : (Number.isFinite(stripTop) ? stripTop - gap : viewH - gap);
  const left0 = Number.isFinite(last?.left) ? last.left : (viewW - w) / 2;
  const top = Math.max(gap, Math.min(Math.round(bottom - h), Math.round(viewH - h - gap)));
  const left = Math.max(gap, Math.min(Math.round(left0), Math.round(viewW - w - gap)));
  return { left, top };
}

/** The roll window's title tag while a sequence runs: "Longsword · swing 2 of 3" (null when idle). */
export function swingTag({ weapon = null, current = null, total = null, kind = "main", status = null } = {}) {
  if (status !== "running" || !current || !total) return null;
  return { weapon: weapon ?? "", i: current, n: total, kind: kind ?? "main" };
}

/* ── usability Area 3 re-run (fixer pass 2) ───────────────────────────────── */

/**
 * Which combatants' turns a combat update ended and began. Core's combatTurnChange passes the
 * previous and current {round, turn, combatantId}; when combat starts, the first combatant was
 * already "current" in round 0, so comparing combatants alone saw no change and the HUD did not
 * follow (round 1 stayed on whoever the HUD showed).
 * @returns {{ended: string|null, began: string|null}}  combatant ids (null = none)
 */
export function turnBoundary(previous = {}, current = {}) {
  const prevId = previous?.combatantId ?? null;
  const curId = current?.combatantId ?? null;
  const prevRound = Number(previous?.round) || 0;
  const curRound = Number(current?.round) || 0;
  const starting = prevRound === 0 && curRound >= 1;
  if (!starting && prevId === curId && prevRound === curRound) return { ended: null, began: null };
  if (!starting && prevId === curId) return { ended: prevId, began: curId };    // a lone combatant's next round
  return { ended: starting ? null : prevId, began: curId };
}

/**
 * The pause bar's second sentence: what the closed roll left unspent. A Full Attack's swings stay on
 * the Action pips; Flurry of Blows already spent its Focus Point (its card was posted before the first
 * strike); a single Bonus-action follow-up spends nothing until it is rolled.
 * @returns {"main"|"flurry"|"bonus"}
 */
export function pausedNote({ kinds = [], paid = false } = {}) {
  const list = (Array.isArray(kinds) ? kinds : []).filter(Boolean);
  if (paid) return "flurry";
  if (list.length && list.every(k => k !== "main" && k !== "nick")) return "bonus";
  return "main";
}

/**
 * Steady Aim (PHB 2024): Advantage on your next attack roll this turn; your Speed is 0 until the end
 * of the turn. As native dnd5e 6 changes: every ability's attack roll mode +1 (the dialog then defaults
 * to Advantage), and each Speed set to 0.
 */
export function steadyAimChanges() {
  return [
    ...["str", "dex", "con", "int", "wis", "cha"].map(a => ({ key: `system.abilities.${a}.attack.roll.mode`, type: "add", value: 1 })),
    ...["walk", "fly", "swim", "climb", "burrow"].map(k => ({ key: `system.attributes.movement.${k}`, type: "override", value: 0 }))
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

/**
 * Where Argon's drawer (Use Feature, Cast Spell, Wild Shape, Starry Form) opens: above its own
 * button, kept inside the HUD's action row. Argon opens every drawer at the row's far left, up to
 * ~370 px from the button and under the portrait.
 *
 * Every input is a SCREEN measurement (getBoundingClientRect). Argon scales the whole HUD with a CSS
 * transform (0.424 on a 1600 px window, less on a narrower one), so a screen distance is divided by
 * `scale` to become the drawer's own `left`. Mixing the two (the drawer's unscaled offsetWidth with
 * the row's scaled width) pinned every wide drawer at 0, under the portrait (Area 4 live run, D1).
 *
 * @param {object} m
 * @param {number} m.buttonLeft  the button's left edge
 * @param {number} m.hudLeft     the left edge of the element `left` is measured from (the drawer's offsetParent)
 * @param {number} m.hudWidth    how far right of hudLeft the drawer may reach
 * @param {number} m.panelWidth  the drawer's width
 * @param {number} [m.minLeft]   the drawer never starts left of this (the action row, right of the portrait)
 * @param {number} [m.scale=1]   the HUD's scale (screen px per CSS px)
 * @returns {number}  the drawer's `left` in its own CSS px
 */
export function drawerLeft({ buttonLeft = 0, hudLeft = 0, hudWidth = 0, panelWidth = 0, minLeft = null, scale = 1 } = {}) {
  const n = (v) => Number(v) || 0;
  const origin = n(hudLeft);
  const lo = Math.max(origin, minLeft === null || minLeft === undefined ? origin : n(minLeft));
  const hi = Math.max(lo, origin + n(hudWidth) - n(panelWidth));
  const x = Math.max(lo, Math.min(n(buttonLeft), hi));
  const k = n(scale) > 0 ? n(scale) : 1;
  return Math.round((x - origin) / k);
}

/* ── usability Area 5 re-run: spells spend their pip; Quickened Spell ─────── */

/**
 * Which pip a used activity spends (Argon's item buttons, every spell from Cast Spell, spent none:
 * usability Area 5 re-run, S5/S14). Quickened Spell (PHB 2024: "change the casting time to a Bonus
 * Action for this casting") turns the next 1-Action spell into the Bonus Action.
 * Off your own turn in combat an Action-or-Bonus use is not counted (a Readied spell is the GM's
 * call); a Reaction is counted on any turn.
 *
 * @param {object} p
 * @param {string|null} p.activation   activity.activation.type
 * @param {boolean} [p.isSpell=false]  the item is a spell (a wand's or scroll's cast counts too)
 * @param {boolean} [p.quickened=false] Quickened Spell is waiting on this turn
 * @param {boolean} [p.inCombat=false]
 * @param {boolean} [p.isOwnTurn=true]
 * @returns {"action"|"bonus"|"reaction"|null}
 */
export function pipFor({ activation = null, isSpell = false, quickened = false, inCombat = false, isOwnTurn = true } = {}) {
  if (!inCombat) return null;
  if (activation === "reaction") return "reaction";
  if (!isOwnTurn) return null;
  if (activation === "action") return isSpell && quickened ? "bonus" : "action";
  if (activation === "bonus") return "bonus";
  return null;
}

/** Quickened Spell was used: the next 1-Action spell this turn is the Bonus Action. */
export function recordQuickened(turn) {
  const t = readTurn(turn, turn?.key);
  return { ...t, quickened: true };
}

/** The Quickened spell was cast: it spent the Bonus Action, not an Action. */
export function recordQuickenedCast(turn) {
  const t = readTurn(turn, turn?.key);
  return { ...t, quickened: false, bonusUsed: true };
}

/**
 * What Argon's own single Action / Bonus pips should show after the HUD is rebuilt (a re-bind made
 * new panels with every pip lit, although this turn's flag says they were spent).
 * @returns {{action: boolean, bonus: boolean}}  true = spent
 */
export function spentPips(turn) {
  return { action: actionsLeft(turn, 1) <= 0, bonus: !!turn?.bonusUsed };
}

/**
 * Is the Reaction still spent? It is recorded with the combat it was taken in and cleared when the
 * actor's own turn starts (2024 PHB: "you regain it at the start of your next turn").
 * @param {{combatId?: string}|null} flag
 * @param {string|null} combatId  the actor's current combat
 */
export function reactionSpent(flag, combatId) {
  return !!(flag && combatId && flag.combatId === combatId);
}

/**
 * Which of an actor's per-combat flags belong to a combat that was just deleted: the turn flag (its
 * key is "combatId:round:turn") and the Reaction record. They are inert once the combat is gone, but
 * they stayed on the PCs for good (usability Area 9 found them on Caven, Talo and Marrith). The
 * out-of-combat turn ("nocombat") is never touched.
 * @param {{turn?: {key?: string}|null, reaction?: {combatId?: string}|null}} flags
 * @param {string|null} combatId
 * @returns {string[]} flag keys to unset ("turn", "reaction")
 */
export function staleCombatFlags(flags, combatId) {
  if (!combatId || !flags || typeof flags !== "object") return [];
  const out = [];
  const key = flags.turn?.key;
  if (typeof key === "string" && key.startsWith(`${combatId}:`)) out.push("turn");
  if (flags.reaction && typeof flags.reaction === "object" && flags.reaction.combatId === combatId) out.push("reaction");
  return out;
}

/* ── usability Area 10 (melee build-review live checks), fixer pass ──────── */

/**
 * Flags left by a combat that no longer exists. `staleCombatFlags` runs when a combat is deleted,
 * but a combat deleted while no GM was connected, or before that cleanup existed, left its turn and
 * Reaction flags on the PCs for good (Area 10: Marrith carried a turn flag from a long-gone combat).
 * The active GM sweeps the world's actors with this on load and after every combat deletion.
 * The out-of-combat turn ("nocombat") is never touched.
 * @param {{turn?: {key?: string}|null, reaction?: {combatId?: string}|null}} flags
 * @param {Iterable<string>} liveIds  the ids of every combat in the world
 * @returns {string[]} flag keys to unset ("turn", "reaction")
 */
export function orphanCombatFlags(flags, liveIds = []) {
  if (!flags || typeof flags !== "object") return [];
  const live = new Set(liveIds ?? []);
  const out = [];
  const key = flags.turn?.key;
  if (typeof key === "string" && key !== "nocombat" && key.includes(":")) {
    const id = key.slice(0, key.indexOf(":"));
    if (id && !live.has(id)) out.push("turn");
  }
  const r = flags.reaction;
  if (r && typeof r === "object" && typeof r.combatId === "string" && r.combatId && !live.has(r.combatId)) out.push("reaction");
  return out;
}

/**
 * A pause-bar weapon swap's Nick swing (PHB 2024). The Light property's extra attack is made with a
 * DIFFERENT Light weapon, and Nick lets it be part of the Attack action. Swapping the main swings
 * onto the Dagger used to keep the planned "Nick: Dagger" swing, so the Dagger swung three times
 * (Area 10). The swap now replaces the unrolled Nick swing with what the new main weapon earns
 * (`extraSwings` for it): another Nick weapon, or none.
 * @param {{index: number, swings: object[]}} state
 * @param {object[]|null} extras  extraSwings() for the new main weapon; null keeps the old plan
 * @returns {object[]} the new swing list
 */
export function replanExtras(state, extras) {
  const swings = state?.swings ?? [];
  if (!Array.isArray(extras)) return swings;
  const index = state?.index ?? 0;
  const kept = swings.filter((s, i) => i < index || s.kind !== "nick");
  // A Nick swing already rolled this sequence means the Light extra attack is spent: nothing new.
  if (swings.some((s, i) => i < index && s.kind === "nick")) return kept;
  return [...kept, ...extras.map(x => ({ weaponId: x.weaponId, mode: x.mode ?? "offhand", kind: x.kind ?? "nick" }))];
}

/**
 * Keep a window on screen. A roll window opened outside a Full Attack (Lay on Hands' Healing roll)
 * was placed partly below the viewport's bottom edge (Area 10). Returns the moved position, or
 * null when it already fits.
 * @returns {{left: number, top: number}|null}
 */
export function clampToView({ left = 0, top = 0, width = 0, height = 0, viewW = 0, viewH = 0, margin = 8 } = {}) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const l0 = Number(left) || 0;
  const t0 = Number(top) || 0;
  if (!viewW || !viewH) return null;
  const l = Math.max(margin, Math.min(l0, viewW - w - margin));
  const t = Math.max(margin, Math.min(t0, viewH - h - margin));
  const L = Math.round(l), Tp = Math.round(t);
  return (L === Math.round(l0) && Tp === Math.round(t0)) ? null : { left: L, top: Tp };
}

/* ── usability re-run, Area 10 follow-up (2026-10-11) ─────────────────────── */

/**
 * What the HUD does when one of your creatures' turns begins (U-1-9, U-10-2, U-10-10). `now`: show
 * it at once, only while Argon is on. `recheck`: look again (ms) once Argon's own start-of-combat
 * bind is done — at combat start ALSO while Argon is still off: after a deleted combat Argon is off
 * when this hook fires, and its own updateCombat handler (which runs after it) switches it on and
 * binds `controlled[0] ?? _token`, the old token. Each recheck still needs Argon on by then.
 * @returns {{now: boolean, recheck: number[]}}
 */
export function hudFollowPlan({ enabled = false, owner = false, onScene = false, argonOn = false, combatStart = false } = {}) {
  if (!enabled || !owner || !onScene) return { now: false, recheck: [] };
  return { now: !!argonOn, recheck: combatStart ? [300, 1200] : [] };
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

/** A usage card's `system.deltas` show something consumed (a use, a slot, ammunition, an item). */
export function deltasConsumed(deltas) {
  if (!deltas || typeof deltas !== "object") return false;
  if ((deltas.actor ?? []).length) return true;
  return Object.values(deltas.item ?? {}).some(list => (list ?? []).length);
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

/* ── Full Attack plan (moved from sequence.mjs, combat-riders-22; the body is unchanged) ── */

/**
 * The swings a Full Attack would make right now, for the button's badge and for start. Pure: the
 * caller passes the actor's weapon shapes and its Enhanced Dual Wielding flag.
 * KNOWN (combat-riders-22): Multiattack ignores Action Surge — a surged turn plans nothing here.
 * @returns {{swings: object[], count: number, left: number, weaponId: string|null}}
 */
export function fullAttackPlanFrom({ weapons = [], weaponId = null, turn = null, inCombat = false, multiattack = null, count = 1, pick = null, enhancedDualWielding = false } = {}) {
  if (multiattack) {
    const plan = pick ? multiattackPlan(multiattack, { pick }) : multiattack.plan;
    const total = plan.reduce((s, r) => s + r.count, 0);
    const done = inCombat ? (turn?.attackAction?.swings ?? 0) : 0;
    const swings = inCombat && attackActions(turn) === 0 ? [] : planSequence({ multiattack: plan, done });
    return { swings, count: total, left: swings.length, weaponId: plan[0]?.itemId ?? null };
  }
  const main = weapons.find(w => w.id === weaponId) ?? null;
  const left = swingsLeft(count, turn, { inCombat });
  const extras = extraSwings({ main, weapons, turn, enhancedDualWielding });
  const swings = left > 0 ? planSequence({ weaponId, count: left, extras }) : [];
  return { swings, count, left, weaponId };
}

/**
 * An area spell whose template placement was cancelled was not cast (pentaryn-aoe refunds it):
 * no pip, no Action. `wanted`: the usage asked for a template; `hasArea`: the activity has one;
 * `placed`: templates made; `onScene`: a scene is viewed. (combat-riders-36, the move; reading
 * aoe's own refund decision is a separate, declared change.)
 */
export function areaPlacementSkipped({ wanted = false, hasArea = false, placed = 0, onScene = false } = {}) {
  return !!(wanted && hasArea && !placed && onScene);
}
