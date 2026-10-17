// pentaryn kit 1.2.0 · vendored from foundry/lib/pull-rule.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Who core pulls, as core decides it — one copy for every module (code review 2026-10-17 CR8:
 * pentaryn-portals and pentaryn-pins each kept their own, and pins read ownership through
 * `doc.actor`, which builds a token's synthetic actor).
 *
 * Foundry v14.369, the two places core asks "does this user still have eyes on that level?":
 *  - client/data/region-behaviors/teleport-token.mjs:212-236 `#getUsersToPull` (usersToPull,
 *    pullCandidates) — who a Teleport Token region pulls after a carry;
 *  - client/documents/token.mjs:2943-2944 — whether a token's level move switches the viewer's level.
 * Both share one clause, ownsOtherSighted: the user owns another non-hidden token on that level
 * with sight (or the scene has no token vision).
 *
 * Ownership is `TokenDocument#testUserPermission` alone: core's `getUserLevel` already delegates to
 * the token's actor (common/documents/token.mjs:940-945). Pure: no Foundry global is read; the
 * caller passes the scene, the token and the users.
 */

/** Any collection's values: a Foundry Collection or Map (keyed), an array, or nothing. */
const valuesOf = c => (c ? [...(typeof c.values === "function" ? c.values() : c)] : []);

/** A token's level as core compares it (`_source.level`); the prepared level as a fallback; else null. */
export function sourceLevel(token) {
  return token?._source?.level ?? token?.level ?? null;
}

/**
 * Does `user` own a non-hidden token on `scene`, other than `except` (a token id or document), on
 * level `level`, with sight enabled — or any sight when the scene has no token vision?
 * @param {Scene} scene  @param {User} user
 * @param {{ except?: string|TokenDocument|null, level?: string|null }} [opts]
 * @returns {boolean}
 */
export function ownsOtherSighted(scene, user, { except = null, level = null } = {}) {
  const skip = typeof except === "string" ? except : except?.id ?? null;
  return valuesOf(scene?.tokens).some(t => t && t.id !== skip && !t.hidden
    && t.testUserPermission?.(user, "OWNER") === true
    && sourceLevel(t) === (level ?? null)
    && (!scene.tokenVision || t.sight?.enabled === true));
}

/**
 * The records usersToPull reads, one per user, built as core evaluates them for `token` on `scene`
 * (call it AFTER a carry: the carried company is already off `scene`). `srcLevel`: the token's
 * level read before the carry (default its source level now).
 * @param {TokenDocument} token  @param {Scene} scene  @param {Iterable<User>|Map} users
 * @returns {{ id, active, isGM, viewedScene, viewedLevel, observes, ownsOtherSighted }[]}
 */
export function pullCandidates(token, scene, users, srcLevel = sourceLevel(token)) {
  return valuesOf(users).map(u => ({
    id: u.id, active: !!u.active, isGM: !!u.isGM,
    viewedScene: u.viewedScene ?? null, viewedLevel: u.viewedLevel ?? null,
    observes: token?.testUserPermission?.(u, "OBSERVER") === true,
    ownsOtherSighted: ownsOtherSighted(scene, u, { except: token, level: srcLevel }),
  }));
}

/**
 * core's #getUsersToPull for a GM mover (the GM is both `user` and `designatedUser`, so "the mover
 * is always pulled" never applies to a player): nobody for a hidden token; else every active
 * player viewing `scene` and `level` who observes the token and owns no other sighted token there.
 * Records in (pullCandidates), user ids out, in order.
 * @param {{ id, active, isGM, viewedScene, viewedLevel, observes, ownsOtherSighted }[]} users
 * @param {{ hidden: boolean, scene: string, level: string|null }} where
 * @returns {string[]}
 */
export function usersToPull(users, { hidden, scene, level }) {
  if (hidden) return [];
  return users.filter(u => u.active && !u.isGM && u.viewedScene === scene && (u.viewedLevel ?? null) === (level ?? null)
    && u.observes && !u.ownsOtherSighted).map(u => u.id);
}
