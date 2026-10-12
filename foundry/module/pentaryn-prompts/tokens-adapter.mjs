/**
 * pentaryn-prompts — an actor's token data for a create (prompts-lookup-24): the one place the
 * four actor-to-token clones (the P key, a size chip's swap, a hotspot, a placed creature) build it.
 *
 * ADAPTER (Actor#getTokenDocument). It never decides level or elevation: each caller passes its own
 * through `extra` (the P key sets the canvas level only when there is one; a size swap copies the
 * marker's elevation and level, a null level included; replace sets the marker's level when it has
 * one and leaves elevation to its provenance stamp).
 */

/**
 * `at`: where the TokenDocument is built (and, with `snap`, snapped from). `x`/`y`: the position
 * written (default `at`). → the document's `toObject()` minus `_id`, with `{x, y}` and `extra` on it.
 */
export async function tokenDataFrom(a, scene, { at, x = at.x, y = at.y, snap = false, extra = {} }) {
  // `a`, not `actor`: a broken actor's TypeError reads "a.getTokenDocument is not a function", as the
  // replace readback has always printed it (golden replace-character)
  const td = await a.getTokenDocument({ x: at.x, y: at.y }, { parent: scene });
  const pos = snap ? td.getSnappedPosition({ x: at.x, y: at.y }) : { x, y };
  const data = td.toObject();
  delete data._id;
  return Object.assign(data, { x: pos.x, y: pos.y }, extra);
}
