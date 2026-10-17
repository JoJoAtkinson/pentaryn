/**
 * Pentaryn Pins — FEATURE: a pinned player whose character is on another scene is left out of
 * pentaryn-portals' pulls (code review CR7; replaces portals' own `pinnedToken` read per user).
 *
 * Portals fires `Hooks.call("pentaryn-portals.prePull", users, { scene, level, token, reason, pull })`
 * once before each cross-scene pull it sends (reason "token" for teleportToken, "party" for Teleport
 * party; token null for a party move; `pull` = teleportToken's own list, pulled whatever this does),
 * with `users` the mutable User[] it is about to pull. This listener splices out, in place, every
 * non-GM user whose pin (switch on) resolves to one token on a scene other than
 * `scene`. One token walk per pull (world-adapter pinTargets), whatever the number of users.
 * Synchronous, and never returns false: a `false` would veto the whole pull for everyone. With the
 * switch off, or for an unpinned user or a pin with no single token, the list is left as it is
 * (stock). A throw is logged by the kit's guard and changes nothing.
 */

import { pinTargets } from "./world-adapter.mjs";

export const PRE_PULL = "pentaryn-portals.prePull";

/**
 * Drop pinned-elsewhere players from `users` (in place). → the ids dropped (for the tests; the hook
 * caller ignores a non-false return).
 */
export function dropPinnedElsewhere(users, { scene } = {}, { enabled = false } = {}) {
  if (!enabled || !Array.isArray(users) || !users.length) return [];
  const sceneId = typeof scene === "string" ? scene : scene?.id ?? null;
  if (!sceneId) return [];
  const targets = pinTargets();
  const dropped = [];
  for (let i = users.length - 1; i >= 0; i--) {
    const u = users[i];
    const t = u && !u.isGM ? targets[u.id] : null;
    if (t && t.token.scene !== sceneId) {
      dropped.unshift(u.id);
      users.splice(i, 1);
    }
  }
  return dropped;
}

export function install(reg, ctx) {
  reg.on(PRE_PULL, (users, data) => {
    const dropped = dropPinnedElsewhere(users, data ?? {}, { enabled: !!ctx.setting("pinning") });
    if (dropped.length) ctx.log.debug?.("prePull: pinned elsewhere, not pulled", { ids: dropped, reason: data?.reason ?? null });
    return undefined;
  }, { label: "prePull: leave pinned-elsewhere players" });
}

export function uninstall() {}
