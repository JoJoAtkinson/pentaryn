// pentaryn kit 1.2.0 · vendored from foundry/lib/root-actor.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * The ROOT actor a token stands for — one rule for every module (code review 2026-10-17 #11:
 * portals and pins each kept their own, and they disagreed on what counts as an id).
 *
 * dnd5e 6.0.6 `transformInto` (wild shape, polymorph) points the token at a new form actor and
 * names the original in `flags.dnd5e.originalActor` — on the token, and on the form actor — and in
 * the form actor's `flags.dnd5e.previousActorIds`, whose first entry is the first actor of a chain.
 * A summon's `flags.dnd5e.summon.origin` names that original, never the form.
 *
 * Pure: the caller reads the flags (a token's own `actorId`, its flags, its actor's flags) and
 * passes the values in. Only a Foundry document id (16 letters and digits) counts; anything else in
 * a slot is skipped, as if it were empty.
 */

const ID = /^[A-Za-z0-9]{16}$/;
const isId = v => typeof v === "string" && ID.test(v);

/**
 * The token's original actor while transformed — the token flag, else the form actor's flag, else
 * `previousIds[0]` — else its own `actorId`. null when none of them is an id.
 * @param {{ actorId?: *, tokenOriginal?: *, actorOriginal?: *, previousIds?: * }} [t]
 * @returns {string|null}
 */
export function rootActorId({ actorId = null, tokenOriginal = null, actorOriginal = null, previousIds = null } = {}) {
  if (isId(tokenOriginal)) return tokenOriginal;
  if (isId(actorOriginal)) return actorOriginal;
  if (Array.isArray(previousIds) && isId(previousIds[0])) return previousIds[0];
  return isId(actorId) ? actorId : null;
}
