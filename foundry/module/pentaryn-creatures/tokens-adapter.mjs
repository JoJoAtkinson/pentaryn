/**
 * Pentaryn Creatures — ADAPTER: a TokenDocument → the plain summary the core rules take. The only
 * file that reads the other modules' flags off a document (pentaryn-aoe's handle flags, Item Piles'
 * `data.enabled`, dnd5e's `originalActor`); the decisions on them are core's (isAoeHandle,
 * isItemPile).
 */

import { isAoeHandle, isItemPile } from "./creatures-core.mjs";

/** An Item Piles pile (token or actor flag). */
export function isPile(t) {
  return isItemPile(t.flags, t.actor?.flags);
}

/** A prop, not a creature: pentaryn-aoe's spell-area handle is an `npc` every player owns (`default: OWNER`). */
export function isProp(t) {
  return isAoeHandle(t.flags, t.actor?.flags);
}

/** A plain summary of a TokenDocument, as seen by `user`. */
export function summarize(t, user = game.user) {
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
