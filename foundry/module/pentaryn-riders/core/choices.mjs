/**
 * Pentaryn Feature Riders — PURE: pick-one passive effects (feedback tNdOEx / tiDvFa).
 *
 * A feature whose holder picks one benefit from a short list and may change it later (the Wizard
 * Transmuter's Stone: Darkvision, +10 ft Speed, or Resistance to one of six types) is authored as
 * one passive (transfer) effect per benefit on the feature item, each flagged
 *
 *   flags.pentaryn-riders.choice = { group: "<name>", max: <number or formula> }
 *
 * They show in the sheet's Effects tab under Passive, where the player toggles them. Turning one on
 * turns off the others of its group beyond `max`, the longest-unchanged first. `max` is a number or
 * a deterministic formula over the actor's roll data ("min(2, 1 + floor(@classes.wizard.levels / 10))"
 * — two benefits from Wizard 10), so the data does not need editing when the character levels.
 */

/** The flag key under `flags.pentaryn-riders`. */
export const CHOICE_FLAG = "choice";

/**
 * The choice an effect belongs to, from its flags (`effect.flags`), or null.
 * @param {{ flags?: object }} effect
 * @param {string} scope  the flag scope (the module id)
 * @returns {{ group: string, max: number|string }|null}
 */
export function choiceOf(effect, scope) {
  const c = effect?.flags?.[scope]?.[CHOICE_FLAG];
  if (!c || typeof c !== "object") return null;
  const group = typeof c.group === "string" ? c.group.trim() : "";
  if (!group) return null;
  return { group, max: c.max ?? 1 };
}

/**
 * The resolved limit: a positive whole number. A formula goes through `evaluate(formula)` (the
 * caller's deterministic evaluator); anything unusable is 1, the safe reading of "pick one".
 */
export function choiceLimit(max, evaluate = null) {
  let n = max;
  if (typeof n === "string" && n.trim() !== "" && !Number.isFinite(Number(n))) {
    try { n = evaluate ? evaluate(n) : NaN; } catch { n = NaN; }
  }
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Which sibling effects to turn off after `changedId` was turned on.
 * @param {string} changedId
 * @param {Array<{ id: string, group: string|null, disabled: boolean, modified?: number }>} effects
 *        every effect on the same parent (the changed one included or not)
 * @param {string} group
 * @param {number} limit  how many of the group may be on at once
 * @returns {string[]}  ids to disable, oldest change first
 */
export function choiceToDisable(changedId, effects, group, limit = 1) {
  const others = (effects ?? [])
    .filter(e => e && e.id !== changedId && e.group === group && !e.disabled)
    .sort((a, b) => (Number(b.modified) || 0) - (Number(a.modified) || 0));   // newest first
  const keep = Math.max(0, limit - 1);
  return others.slice(keep).reverse().map(e => e.id);
}
