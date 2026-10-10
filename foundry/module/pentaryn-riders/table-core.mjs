/**
 * Pure helpers for concentration.mjs and argon-tidy.mjs (no Foundry globals at import).
 * Fixtures: test/table.mjs (`node test/table.mjs`, also run from test/run.mjs).
 */

export const MOD = "pentaryn-riders";

/** The flag a summoned token carries: the uuid of the concentration effect that keeps it. */
export const SUMMON_FLAG = "concentration";

/**
 * The concentration effect that a cast of `itemId` started, among an actor's effects.
 * dnd5e 6 marks each concentration effect with flags.dnd5e.item = { id, type, ... }.
 * The last match wins (a re-cast creates the new effect before ending the old one).
 * @param {Iterable<{ id?: string, uuid?: string, flags?: object, statuses?: Set<string>|string[] }>} effects
 * @param {string} itemId
 * @param {string} [status="concentrating"]
 * @returns {object|null}
 */
export function concentrationEffectFor(effects, itemId, status = "concentrating") {
  if (!itemId) return null;
  let found = null;
  for (const e of effects ?? []) {
    const statuses = e?.statuses instanceof Set ? e.statuses : new Set(e?.statuses ?? []);
    if (!statuses.has(status)) continue;
    const data = e?.flags?.dnd5e?.item ?? {};
    if (data.id === itemId || data.data?._id === itemId) found = e;
  }
  return found;
}

/**
 * Ids of the tokens (of one scene) that a deleted concentration effect was keeping on the map.
 * @param {Iterable<{ id: string, flags?: object }>} tokens
 * @param {string} effectUuid
 * @returns {string[]}
 */
export function summonTokenIds(tokens, effectUuid) {
  if (!effectUuid) return [];
  const ids = [];
  for (const t of tokens ?? []) {
    if (t?.flags?.[MOD]?.[SUMMON_FLAG] === effectUuid) ids.push(t.id);
  }
  return ids;
}

/**
 * Does this item have an activity that spends another item's uses (`itemUses` consumption)?
 * Argon's badge on such a button shows the other item's uses, but Argon only re-renders the
 * button when its OWN item changes.
 * @param {{ system?: { activities?: Iterable<object> } }} item
 * @param {string} targetId   the item whose uses changed
 * @returns {boolean}
 */
export function spendsUsesOf(item, targetId) {
  if (!item || !targetId) return false;
  for (const a of item.system?.activities ?? []) {
    for (const t of a?.consumption?.targets ?? []) {
      if (t?.type === "itemUses" && t.target === targetId) return true;
    }
  }
  return false;
}
