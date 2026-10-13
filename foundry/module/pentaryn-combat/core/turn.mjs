/**
 * Pentaryn Combat core — the turn flag: its key, reading and recording, swings and pips left, which pip a use spends, stale and orphan flags.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

/** The swing kinds that are part of the Attack action (a Nick swing rides on it; PHB 2024). */
export const ATTACK_ACTION_KINDS = Object.freeze(["main", "nick"]);

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
  if (ATTACK_ACTION_KINDS.includes(kind)) {
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

/**
 * Actions still free this turn: 1 + Action Surges, minus other Actions taken, minus Attack actions
 * begun (a Fighter 5 who swung once has begun one Attack action: `count` = 2 swings per action).
 */
export function actionsLeft(turn, count = 1) {
  const swings = Number(turn?.attackAction?.swings) || 0;
  const per = Math.max(1, Number(count) || 1);
  return Math.max(0, 1 + (Number(turn?.surges) || 0) - otherActionsOf(turn) - Math.ceil(swings / per));
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
 * Drop the entries of a session map older than `maxAge` ms at `now` (`at(value)` = the entry's
 * time). For maps whose stale entries are never read again (combat-riders-29). @returns {number} dropped
 */
export function pruneOlder(map, now, maxAge, at = v => v) {
  let n = 0;
  for (const [k, v] of map) {
    if (now - (Number(at(v)) || 0) >= maxAge) { map.delete(k); n++; }
  }
  return n;
}
