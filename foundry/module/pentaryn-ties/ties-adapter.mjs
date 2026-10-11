/**
 * Pentaryn NPC Ties — the Foundry adapter: canvas and document reads turned into plain answers.
 *
 * ADAPTER. Imports only core and lib. Every file that asks "can this client see that token" asks
 * here, so the rule has one definition (it had three: overlay, the Known key and pinned-card
 * restore).
 */

/**
 * Can THIS client see that token? `Token#isVisible` is Foundry's own answer — walls, light,
 * detection modes and the GM-hidden flag folded together, per client. A GM sees everything.
 *
 * It is `isVisible`, NOT `visible`: on v14 `Token#visible` is the inherited PIXI flag and reads true
 * for every placeable on the scene, walled off and GM-hidden alike. `visible` is only the fallback
 * for an object that has no `isVisible` at all.
 *
 * @param {object|null} token  a Token placeable
 * @returns {boolean}
 */
export function canSee(token) {
  if (!token) return false;
  if (game.user?.isGM === true) return true;
  return (token.isVisible ?? token.visible) === true;
}

/**
 * Whose eyes are we looking through?
 *
 * A player inspects as their own character — they have exactly one, which is the case the ties
 * dialog already established as "easily resolved". A GM inspects as the **selected** token's
 * actor, so they can throw the check for whichever PC is asking without leaving the canvas.
 *
 * @returns {object|null} the inspecting character, or null
 */
export function inspectorFor() {
  if (game.user?.isGM) {
    const selected = canvas?.tokens?.controlled?.[0];
    const actor = selected?.actor ?? null;
    return actor?.type === "character" ? actor : null;
  }
  return game.user?.character ?? null;
}
