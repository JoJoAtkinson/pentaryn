/**
 * Pure rules for the Loot all button and the corpse eye. No Foundry, no PIXI, no DOM:
 * `node test/run.mjs` exercises every branch.
 */

export const MODULE = "pentaryn-dropbin";

/** Pile types whose loot window is the plain Item Piles inventory (merchants and vaults are not). */
export const LOOTABLE_TYPES = new Set(["pile", "container"]);

/**
 * What the Loot all button should do for one open loot window.
 *
 *   pileData       Item Piles flag data for the pile (getActorFlagData, defaults merged)
 *   empty          the pile has nothing left Item Piles would show
 *   hasRecipient   a character of this user's to receive the loot was found
 *   isGM           the viewing user is a GM
 *   nativeTakeAll  Item Piles' own Take All button is already in the footer
 *
 * Returns { show, disabled, reason } where reason is a lang key suffix or "".
 */
export function lootAllState({ pileData, empty = false, hasRecipient = false, isGM = false, nativeTakeAll = false } = {}) {
  const hide = { show: false, disabled: true, reason: "" };
  if (!pileData?.enabled || !LOOTABLE_TYPES.has(pileData.type)) return hide;
  if (nativeTakeAll) return hide;                    // never two buttons that do the same thing
  if (pileData.type === "container" && (pileData.locked || pileData.closed)) return hide;
  if (!hasRecipient) {
    // A GM with no character of their own has nobody to loot into: keep the footer clean.
    // A player without one sees the button greyed with the reason, so the fix is discoverable.
    return isGM ? hide : { show: true, disabled: true, reason: "noCharacter" };
  }
  if (empty) return { show: true, disabled: true, reason: "empty" };
  return { show: true, disabled: false, reason: "" };
}

/**
 * Whether a corpse token shows the "lootable" eye. All four must hold: it is a corpse we made,
 * Item Piles still treats it as a pile, it still holds something, and it is not secret/revived.
 */
export function showEye({ corpse = false, pile = false, empty = true } = {}) {
  return !!(corpse && pile && !empty);
}

/**
 * Where the eye sits on a token of `width` x `height` pixels (token-local coordinates, anchor
 * at the sprite's centre). The Dead skull is core's overlay: 60% of the short side, centred. The
 * eye is a 40% badge in the top-right corner, so both read at a glance and the eye sits on top.
 */
export function eyePlacement(width, height) {
  const w = Number(width) > 0 ? Number(width) : 0;
  const h = Number(height) > 0 ? Number(height) : 0;
  const size = Math.round(Math.min(w, h) * 0.4);
  return { size, x: w - size / 2, y: size / 2 };
}
