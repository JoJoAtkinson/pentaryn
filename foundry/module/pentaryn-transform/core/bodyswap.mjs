/**
 * Pentaryn Transform — pure body-swap rules (the token side of a transform or revert).
 */

/**
 * Is this token update a body swap: a transform or a revert putting another actor (or a polymorphed
 * delta) on the token? Such an update must not animate (transform.mjs, preUpdateToken): core's token
 * animation writes its in-flight values back onto the TokenDocument every frame, and in a tab whose
 * canvas is not ticking (a background tab) it never finishes, so the document kept the old form's
 * art and size, dnd5e saved those stale values as previousTokenData, and the revert brought the
 * first form's art back (Area 4 live run, D4).
 *
 * @param {object} changes            the update's changes (root keys may be wrapped by core)
 * @param {object} [o]
 * @param {string|null} [o.actorId]   the token's current actorId
 * @param {Function} [o.unwrap]       turns a core field operator into its plain value
 * @returns {boolean}
 */
export function isBodySwap(changes, { actorId = null, unwrap = v => v } = {}) {
  if (!changes || typeof changes !== "object") return false;
  if (Object.hasOwn(changes, "actorId")) {
    const next = unwrap(changes.actorId);
    if (next !== actorId) return true;
  }
  for (const key of ["previousTokenData", "previousActorData"]) {
    if (Object.hasOwn(changes, `flags.dnd5e.${key}`)) return true;
    const flags = unwrap(changes.flags);
    const dnd5e = flags && typeof flags === "object" ? unwrap(flags.dnd5e) : null;
    if (dnd5e && typeof dnd5e === "object" && Object.hasOwn(dnd5e, key)) return true;
  }
  return false;
}
