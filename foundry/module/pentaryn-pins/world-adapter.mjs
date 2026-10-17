/**
 * Pentaryn Pins — ADAPTER: Foundry documents → the plain data the core rules take.
 *
 * The only file that reads dnd5e's transform flags (`flags.dnd5e.originalActor`,
 * `flags.dnd5e.previousActorIds`, written by dnd5e 6.0.6 `transformInto`) and walks every scene's
 * tokens. Nothing here needs `canvas`: the bot GM tab calls the API without one.
 */

import { FLAG_SCOPE, PIN_FLAG, auditPins, pickToken, pinOf } from "./pins-core.mjs";
import { readFlag } from "./lib/flags.mjs";
import { rootActorId } from "./lib/root-actor.mjs";

/** A Foundry collection (or Map, or array) as an array; [] for none. The one copy pins uses. */
export function listOf(coll) {
  if (!coll) return [];
  if (Array.isArray(coll)) return coll;
  if (Array.isArray(coll.contents)) return coll.contents;
  if (typeof coll.values === "function") return [...coll.values()];
  return [...coll];
}

/**
 * A token's base (world) actor. Never `token.actor`: in v14 that getter materializes an unlinked
 * token's lazy ActorDelta and builds a synthetic actor, and these walks visit every token in the world.
 */
const baseActorOf = token => globalThis.game?.actors?.get?.(token.actorId) ?? null;

/** An actor's dnd5e transform flags, in the slots rootActorId takes ({} for no actor). The one reader. */
const transformOf = actor => (actor ? {
  actorOriginal: readFlag(actor, "dnd5e", "originalActor"),
  previousIds: readFlag(actor, "dnd5e", "previousActorIds"),
} : {});

/**
 * The root actor id of a token: its original actor while wild-shaped or polymorphed, else its own.
 * A transformed linked token carries `flags.dnd5e.originalActor` itself; a form actor carries it
 * (and `previousActorIds`) on the base actor. dnd5e's unlinked transform writes the synthetic actor's
 * own id there, which is the token's actorId: the base actor answers the same.
 */
export function rootOfToken(token) {
  if (!token) return null;
  return rootActorId({ actorId: token.actorId, tokenOriginal: readFlag(token, "dnd5e", "originalActor"), ...transformOf(baseActorOf(token)) });
}

/** The root actor id of an actor (a form actor maps to its original). */
export function rootOfActor(actor) {
  if (!actor) return null;
  return rootActorId({ actorId: actor.id, ...transformOf(actor) });
}

/** The pinned root actor id of a user, or null. */
export function pinOfUser(user) {
  return pinOf(user?.flags);
}

/** The flag path a pin is stored at, on the User. */
export const PIN_PATH = `flags.${FLAG_SCOPE}.${PIN_FLAG}`;

/** One token as plain data: the candidate record pickToken and the audit take. */
export function tokenRecord(token, root = rootOfToken(token)) {
  const scene = token.parent;
  return {
    doc: token,
    id: token.id,
    uuid: token.uuid,
    scene: scene?.id ?? null,
    sceneName: scene?.name ?? null,
    level: token.level ?? null,
    x: token.x, y: token.y,
    linked: !!token.actorLink,
    form: token.actorId && token.actorId !== root ? (baseActorOf(token)?.name ?? token.name ?? null) : null,
  };
}

/** Every token, on every scene, whose ROOT actor is `rootId`. */
export function tokensOfRoot(rootId) {
  return tokensByRoots([rootId])[rootId] ?? [];
}

/** root id → token records, for the given roots only (one pass over every scene). */
export function tokensByRoots(roots) {
  const want = new Set((roots ?? []).filter(Boolean));
  const out = Object.fromEntries([...want].map(r => [r, []]));
  if (!want.size) return out;
  for (const scene of listOf(game.scenes)) {
    for (const t of listOf(scene.tokens)) {
      const root = rootOfToken(t);
      if (want.has(root)) out[root].push(tokenRecord(t, root));
    }
  }
  return out;
}

/** Every user that carries a pin flag (GMs included: the audit reports them). */
export function pinnedUsers() {
  return listOf(game.users).map(u => ({ user: u, root: pinOfUser(u) })).filter(p => p.root);
}

/**
 * A user's pin resolved to its token: `{ root, cands, token }`; token null when there is none or
 * the choice is ambiguous. `latestUuid` and `viewedSceneId` only matter on the pinned client itself.
 */
export function resolvePin(user, { latestUuid = null, viewedSceneId = null } = {}) {
  const root = pinOfUser(user);
  if (!root) return { root: null, cands: [], token: null };
  const cands = tokensOfRoot(root);
  return { root, cands, token: pickToken(cands, { latestUuid, viewedSceneId }) };
}

/**
 * Can `user` observe `actor` (token vision and levels come only from tokens a player observes)?
 * null when there is no actor or no permission test to ask.
 */
export function observes(user, actor) {
  if (!actor || typeof actor.testUserPermission !== "function") return null;
  return actor.testUserPermission(user, "OBSERVER") === true;
}

/** The audit over the live world (plain result; see core auditPins). */
export function auditWorld() {
  const pinned = pinnedUsers();
  const users = Object.fromEntries(listOf(game.users).map(u => [u.id, { id: u.id, name: u.name, isGM: !!u.isGM }]));
  const actors = {};
  for (const { root } of pinned) {
    const a = game.actors.get(root);
    if (a) actors[root] = { id: a.id, name: a.name };
  }
  return auditPins({
    pins: pinned.map(p => ({ user: p.user.id, actor: p.root, observes: observes(p.user, game.actors.get(p.root)) })),
    users, actors,
    tokensByRoot: tokensByRoots(pinned.map(p => p.root)),
  });
}
