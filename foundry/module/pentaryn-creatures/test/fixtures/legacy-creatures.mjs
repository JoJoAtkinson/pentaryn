/**
 * The oracle for guide step 2's predicates (transform-creatures-30): creatures.mjs :28-55 at
 * wave-3-base (a5a1a90; unchanged since 4e64f47), copied verbatim. The only edit: `summarize`'s
 * default `user = game.user` is a required parameter, so the oracle needs no Foundry globals.
 *
 * Step 2 replaces isPile/isProp with core isItemPile(tokenFlags, actorFlags) /
 * isAoeHandle(tokenFlags, actorFlags); core.test and glue.test prove equality against this file.
 */

export function isPile(t) {
  const a = t.actor;
  return !!(t.flags?.["item-piles"]?.data?.enabled || a?.flags?.["item-piles"]?.data?.enabled);
}

/** A prop, not a creature: pentaryn-aoe's spell-area handle is an `npc` every player owns (`default: OWNER`). */
export function isProp(t) {
  return !!(t.flags?.["pentaryn-aoe"]?.handle || t.actor?.flags?.["pentaryn-aoe"]?.handleActor);
}

/** A plain summary of a TokenDocument, as seen by `user`. */
export function summarize(t, user) {
  const a = t.actor;
  return {
    id: t.id,
    name: t.name,
    img: t.texture?.src,
    actorImg: a?.img,
    actorId: a ? (t.actorId || a.id) : null,
    originalActorId: a?.flags?.dnd5e?.originalActor ?? null,
    actorType: a?.type,
    hasPlayerOwner: a?.hasPlayerOwner === true,
    isOwner: user.isSelf ? t.isOwner : t.testUserPermission(user, "OWNER"),
    hidden: t.hidden === true,
    isPile: isPile(t),
    isProp: isProp(t)
  };
}
