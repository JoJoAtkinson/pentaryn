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
 *
 * GATHER CLAUSE (0.3.0, gather plan §3.4): a carry that one of `gather`'s own teleportToken calls
 * made says so — portals passes that call's `opts.gather` on as the hook's `data.gather` (code review
 * G6: a per-call mark, never a module-wide flag read across awaits, so another pull while a gather
 * runs, even of a member's token, keeps today's rule). Such a pull drops EVERY non-GM user from
 * `users`, so a member's carry never pulls an earlier member a second time (the GM's copy of their
 * viewedScene lags their draw) nor an unpinned observer. The member's own pull is not lost: portals
 * adds `pull` after the listeners. Any other pull — a party pull, a portal hop, a single teleport —
 * keeps the rule above exactly.
 */

import { PRE_PULL_HOOK } from "./pins-core.mjs";
import { pinTargets } from "./world-adapter.mjs";

export const PRE_PULL = PRE_PULL_HOOK;

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

/**
 * The gather clause: when this pull is a gather member's carry (`data.gather`, portals' copy of the
 * call's opts.gather, on a token carry), drop every non-GM user from `users` (in place). → the ids
 * dropped, or null when the clause does not apply (the caller then runs dropPinnedElsewhere).
 */
export function dropForGather(users, data = {}) {
  const gather = data?.gather;
  if (!gather || typeof gather !== "object" || !data?.token || !Array.isArray(users)) return null;
  const dropped = [];
  for (let i = users.length - 1; i >= 0; i--) {
    const u = users[i];
    if (u && !u.isGM) {
      dropped.unshift(u.id);
      users.splice(i, 1);
    }
  }
  return dropped;
}

export function install(reg, ctx) {
  reg.on(PRE_PULL, (users, data) => {
    const enabled = !!ctx.setting("pinning");
    const gathered = enabled ? dropForGather(users, data ?? {}) : null;
    if (gathered) {
      if (gathered.length) ctx.log.debug?.("prePull: a gather member's carry pulls only its own player", { ids: gathered });
      return undefined;
    }
    const dropped = dropPinnedElsewhere(users, data ?? {}, { enabled });
    if (dropped.length) ctx.log.debug?.("prePull: pinned elsewhere, not pulled", { ids: dropped, reason: data?.reason ?? null });
    return undefined;
  }, { label: "prePull: leave pinned-elsewhere players" });
}

export function uninstall() {}
