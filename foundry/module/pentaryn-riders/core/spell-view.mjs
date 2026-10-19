/**
 * Pentaryn Feature Riders — PURE: the character sheet's "Prepared / All spells" view (feedback
 * EBGqNA). Re-exported by the riders-core barrel. Plain data in, plain data out: shapes.mjs maps an
 * Item to `spellViewInfo` input, spell-view.mjs reads the user's choice and draws the toggle.
 *
 * dnd5e 6's own "Prepared" filter (`canPrepare && prepared`) also hides cantrips that were never
 * ticked, at-will / innate / ritual-method spells and spells cast from an item, so it is not the
 * "what can I cast today" list. This one hides only what a long rest would have to change: a
 * levelled spell of a preparing method (spell, pact) that is not prepared, and is not cast through
 * another item's activity.
 */

/** The two views; the first is the default for every user and actor. */
export const SPELL_VIEWS = Object.freeze(["prepared", "all"]);

/**
 * Is this item shown in the Prepared view? Anything that is not a spell is always shown (the hook
 * that asks also runs for the Inventory and Features lists).
 * @param {{ type?: string, level?: number, canPrepare?: boolean, prepared?: number, linked?: boolean }} s
 */
export function inPreparedView({ type = "", level = 0, canPrepare = false, prepared = 0, linked = false } = {}) {
  if (type !== "spell") return true;
  if (!level || linked || !canPrepare) return true;
  return Number(prepared) > 0;
}

/** `{ total, shown, hidden }` spell counts for the toggle's labels (non-spells are not counted). */
export function spellViewCounts(spells = []) {
  const list = (spells ?? []).filter(s => s?.type === "spell");
  const shown = list.filter(inPreparedView).length;
  return { total: list.length, shown, hidden: list.length - shown };
}

/** A stored choice → a known view; anything else is the default. */
export function spellViewOf(stored) {
  return SPELL_VIEWS.includes(stored) ? stored : SPELL_VIEWS[0];
}
