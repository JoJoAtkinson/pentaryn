/**
 * Verbatim oracles from transform.mjs at the wave-4 checkpoint (0.3.3). The only edit: Foundry reads
 * are injected as parameters (named in each header). Guide step 3 proves its pure seams equal to
 * these, row by row, before any caller switches.
 */

import { activitiesOf, isWildShapeActivity, pickRunner } from "../../transform-core.mjs";

/**
 * transform.mjs:37-46 — the operator-unwrap loop inside the `_preUpdateOperation` wrap.
 * Injected: `isForced(v)` for `v instanceof Ops.ForcedReplacement`, `valueOf(v)` for
 * `Ops.DataFieldOperator.get(v)`. Returns nothing (mutates `operation`), as today.
 */
export function legacyUnwrap(operation, { isForced, valueOf }) {
  if (operation?.recursive === false) {
    for (const u of operation.updates ?? []) {
      for (const [k, v] of Object.entries(u ?? {})) {
        if (!(isForced(v))) continue;
        const plain = valueOf(v);
        if (plain === null || typeof plain !== "object") u[k] = plain;
      }
    }
  }
}

/** transform.mjs:102-109 `wildShapeActivity`, with `original(actor)` already applied (`host`). */
export function legacyWildShapeActivity(host) {
  for (const item of host?.items ?? []) {
    const activity = activitiesOf(item).find(isWildShapeActivity);
    if (activity) return activity;
  }
  return null;
}

/** transform.mjs:112-117 `forms`, with the activity and `fromUuidSync` injected (`resolve`). */
export function legacyForms(activity, resolve) {
  return (activity?.availableProfiles ?? []).map(p => ({
    id: p._id, name: p.name || resolve(p.uuid)?.name || "?", uuid: p.uuid, actor: resolve(p.uuid) ?? null
  }));
}

/** transform.mjs:423-427 `refund`'s arithmetic: the update it writes, or null when it writes none. */
export function legacyRefund(uses) {
  const spent = uses?.spent;
  if (Number.isFinite(spent) && spent > 0) return { "system.uses.spent": spent - 1 };
  return null;
}

/**
 * transform.mjs:646-649 `isRunner`. Injected: `users` (game.users as an array), `testOwner(u)` for
 * `actor.testUserPermission(u, "OWNER")`, `activeGMId`, `selfId` (game.user.id).
 */
export function legacyIsRunner({ users, testOwner, activeGMId, selfId }) {
  const ownerIds = users.filter(u => u.active && !u.isGM && testOwner(u)).map(u => u.id);
  return pickRunner({ activeGMId: activeGMId ?? null, ownerIds }) === selfId;
}

/** transform.mjs:704-705 — the world-time candidate list. Injected: `actors`, `sceneTokens`. */
export function legacyWorldTimeCandidates(actors, sceneTokens) {
  const candidates = [...actors];
  for (const t of sceneTokens ?? []) if (!t.actorLink && t.actor) candidates.push(t.actor);
  return candidates;
}
