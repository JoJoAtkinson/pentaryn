/**
 * Pentaryn Combat core — the Full Attack sequence: the swing plan, the state machine, the strip's numbers and notes.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

import { multiattackPlan } from "./multiattack.mjs";
import { attackActions, swingsLeft } from "./turn.mjs";
import { extraSwings } from "./weapons.mjs";

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
