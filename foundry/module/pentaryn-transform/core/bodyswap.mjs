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

/**
 * Core v14's non-recursive token update (dnd5e's transform/revert swap) wraps every root key in a
 * ForcedReplacement operator; region tests and waypoint inference then read the raw operator. For
 * a scalar field (or null) the operator means exactly "set this value", so it is unwrapped in
 * place; object fields (texture, sight, ring, flags, delta) keep their operators. The caller keeps
 * the `recursive === false` test and hands the same operation on to core (transform-creatures-5).
 *
 * @param {{ updates?: object[] }} operation           mutated in place
 * @param {{ isForced: (v) => boolean, valueOf: (v) => * }} ops  the operator test and unwrap
 * @returns {number}  how many keys were unwrapped
 */
export function unwrapForcedScalars(operation, { isForced, valueOf }) {
  let n = 0;
  for (const u of operation?.updates ?? []) {
    for (const [k, v] of Object.entries(u ?? {})) {
      if (!isForced(v)) continue;
      const plain = valueOf(v);
      if (plain === null || typeof plain !== "object") {
        u[k] = plain;
        n += 1;
      }
    }
  }
  return n;
}
