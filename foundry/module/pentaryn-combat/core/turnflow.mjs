/**
 * Pentaryn Combat core — turn flow: Argon's special actions, the until-turn-end effect, expiry at turn boundaries, portrait conditions, orphan usage cards, HUD follow, a cancelled area.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

import { normalizeName } from "./identity.mjs";
import { DELAYS } from "./timing.mjs";
import { recordOtherAction, recordSwing } from "./turn.mjs";

/** Argon dnd5e's six built-in action buttons, by key. */
export const SPECIAL_ACTIONS = Object.freeze(["dash", "disengage", "dodge", "hide", "ready", "shove"]);

/** The five speeds in system.attributes.movement (Dash adds to each; Steady Aim sets each to 0). */
export const MOVEMENT_KEYS = Object.freeze(["walk", "fly", "swim", "climb", "burrow"]);

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
  for (const k of MOVEMENT_KEYS) {
    const v = Number(movement?.[k]);
    if (Number.isFinite(v) && v > 0) out.push({ key: `system.attributes.movement.${k}`, type: "add", value: v });
  }
  return out;
}

/**
 * The ActiveEffect our "until the end of this turn" effects are created from: Dash, Disengage
 * (turnflow/action-buttons.mjs) and Steady Aim (turnflow/effects.mjs). `until: "turnEnd"` is what
 * expiringAt sweeps; `special` names the kind; dnd5e shows it as temporary.
 * @param {{module: string, kind: string, name: string, img: string, description: string, changes?: object[], origin: string}} p
 *   module is combat-core's MODULE (the flag scope; core imports only its siblings); description is
 *   the plain, already localized text, wrapped in one paragraph
 */
export function turnEffectData({ module, kind, name, img, description, changes = [], origin } = {}) {
  return {
    name,
    img,
    description: `<p>${description}</p>`,
    transfer: false,
    origin,
    system: { changes },
    flags: { [module]: { until: "turnEnd", special: kind }, dnd5e: { isTemporary: true } }
  };
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
 * What the HUD does when one of your creatures' turns begins (U-1-9, U-10-2, U-10-10). `now`: show
 * it at once, only while Argon is on. `recheck`: look again (ms) once Argon's own start-of-combat
 * bind is done — at combat start ALSO while Argon is still off: after a deleted combat Argon is off
 * when this hook fires, and its own updateCombat handler (which runs after it) switches it on and
 * binds `controlled[0] ?? _token`, the old token. Each recheck still needs Argon on by then.
 * @returns {{now: boolean, recheck: number[]}}
 */
export function hudFollowPlan({ enabled = false, owner = false, onScene = false, argonOn = false, combatStart = false } = {}) {
  if (!enabled || !owner || !onScene) return { now: false, recheck: [] };
  return { now: !!argonOn, recheck: combatStart ? [...DELAYS.hudFollowRecheck] : [] };
}

/** A usage card's `system.deltas` show something consumed (a use, a slot, ammunition, an item). */
export function deltasConsumed(deltas) {
  if (!deltas || typeof deltas !== "object") return false;
  if ((deltas.actor ?? []).length) return true;
  return Object.values(deltas.item ?? {}).some(list => (list ?? []).length);
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
