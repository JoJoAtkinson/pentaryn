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
 * the choice is ambiguous. `viewedSceneId` (the scene that user views) breaks a tie between several.
 */
export function resolvePin(user, { viewedSceneId = null } = {}) {
  const root = pinOfUser(user);
  if (!root) return { root: null, cands: [], token: null };
  const cands = tokensOfRoot(root);
  return { root, cands, token: pickToken(cands, { viewedSceneId }) };
}

/**
 * A token's level when its scene has it, else null. An orphan level (an id the scene no longer
 * has: a carry from before portals 0.6.0, a deleted level) is followed by scene only: core draws
 * the scene's initial level for an unknown id (board.mjs `levels.get(level) ?? initial`), so asking
 * for it would redraw forever (code review B1).
 */
export function levelOn(sceneId, level) {
  if (!level) return null;
  const levels = globalThis.game?.scenes?.get?.(sceneId)?.levels;
  if (typeof levels?.has !== "function") return level;
  return levels.has(level) ? level : null;
}

/**
 * Does `user` have `level` (OWNER, OBSERVER…) on this token document? Core's own
 * TokenDocument#testUserPermission only (it answers as the token's actor: getUserLevel,
 * common/documents/token.mjs:940-945); never `doc.actor` here, which would build a synthetic actor
 * for an unlinked token on every walk (code review CR4).
 */
export function tokenPermits(doc, user, level = "OWNER") {
  if (!doc || !user) return false;
  return doc.testUserPermission?.(user, level) === true;
}

/**
 * Where the GM pulls a pinned player so they see their token (rebuild plan §4.3: `pin()`, the
 * switch-on, a same-scene teleport): `{ scene, options: { level?, controlledTokens? } }`, or null —
 * no single token. Never skipped as "already there": the GM's copy of `User#viewedScene` /
 * `viewedLevel` changes only when the player's draw has finished (board.mjs broadcastActivity), so a
 * player still drawing another scene looks as if they were on the token's (review F1). Core's
 * Scene#view of the scene and level already drawn draws nothing (scene.mjs:274-280), and a pull that
 * lands while loading is replayed (follow.mjs §5.3), so the pull is always safe.
 * `controlledTokens` only when the user owns the token (else core's own fallback picks what to pan
 * to). Plain data: the caller does `game.scenes.get(scene).pullUsers([user], options)`.
 */
export function pullTargetOf(user) {
  const { token } = resolvePin(user, { viewedSceneId: user?.viewedScene ?? null });
  if (!token?.scene) return null;
  const level = levelOn(token.scene, token.level);
  const options = {};
  if (level) options.level = level;
  if (tokenPermits(token.doc, user, "OWNER")) options.controlledTokens = [token.id];
  return { scene: token.scene, options };
}

/**
 * THE pull to a pin (code review CR8: `pin()`, a same-scene `teleport()` and the switch-on all call
 * this one): the GM's core Scene#pullUsers of `user` to pullTargetOf's scene and options. Nothing
 * when the pin has no single token. A failure is logged on `log` (warn), never thrown: the pin or
 * the move itself has landed. → true when the pull was sent.
 */
export function pullToPin(user, log = null) {
  try {
    const p = pullTargetOf(user);
    const scene = p ? game.scenes.get(p.scene) : null;
    if (!scene) return false;
    scene.pullUsers([user], p.options);
    return true;
  } catch (err) {
    log?.warn?.(`pull of ${user?.name ?? "?"} to the pinned token failed`, err);
    return false;
  }
}

/**
 * Every pinned PLAYER's followed token in ONE walk over the world's tokens (code review CR3: a
 * caller that asks about several users — portals' prePull — never walks once per user):
 * `{ [userId]: { root, token } }`, only for non-GM users whose pin resolves to one token (pickToken;
 * the viewed-scene tie-break only for this client's own user, as pinnedToken does).
 */
export function pinTargets({ selfViewedSceneId = null } = {}) {
  const pinned = pinnedUsers().filter(p => !p.user.isGM);
  const byRoot = tokensByRoots(pinned.map(p => p.root));
  const out = {};
  for (const { user, root } of pinned) {
    const self = user.id === globalThis.game?.user?.id;
    const token = pickToken(byRoot[root] ?? [], { viewedSceneId: self ? selfViewedSceneId : null });
    if (token) out[user.id] = { root, token };
  }
  return out;
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
