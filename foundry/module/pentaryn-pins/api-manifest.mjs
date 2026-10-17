/**
 * Pentaryn Pins — the API manifest. PURE DATA: node imports it without a Foundry stub, describe()
 * reports it, and buildApi() refuses to load when it and api.mjs's implementations drift apart.
 *
 * Add a method: a row here + an impl in api.mjs + a case in test/api.test.mjs. Then
 * GOLDEN_UPDATE=1 node --test test/api.test.mjs, and review the golden diff.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./pins-core.mjs";

const USER = { name: "ref", kind: "user", type: "User|uuid|id|exact name", doc: "the player (never a substring)" };

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "pin",
      params: [USER, { name: "opts", type: "{ actor: Actor|uuid|id|exact name, replace = false, dryRun = false }",
        doc: "actor: the character (a wild-shaped form is stored as its original); replace: take the actor from the user it is pinned to" }],
      returns: "{ ok: true, user, actor, previous, cleared, audit, warning?: NOT_OWNER, dryRun? } | { ok: false, code, reason, restored? }",
      gm: true, writes: true, dryRun: true,
      sideEffects: ["flags.pentaryn-pins.actor on the User (the root actor id)", "with replace: that flag deleted on the user who had the actor",
        "switch on and the player online: pullToScene to the token's scene and level (core Scene#pullUsers; a view of what is drawn draws nothing); not when re-pinning the actor they already have"],
      doc: "Pin a character to a player: with the pinning switch on, that player's view follows the character's token, "
        + "and an online player is pulled to the token's scene and level at once. "
        + "BAD_ARGS for a GM user or no actor; CONFLICT when the actor is pinned to another user (unless replace). "
        + "warning NOT_OWNER when the player cannot observe the actor (pinned anyway: their view follows a token they get no vision from). "
        + "A write that throws (INTERNAL) or that a preUpdateUser hook vetoes (REFUSED) changes no pin: the cleared pins are put back (restored: their user ids).",
    },
    {
      path: "unpin",
      params: [USER, { name: "opts", type: "{ dryRun = false }", optional: true }],
      returns: "{ ok: true, user, previous, dryRun? } | { ok: false, code, reason }",
      gm: true, writes: true, dryRun: true,
      sideEffects: ["flags.pentaryn-pins.actor deleted on the User"],
      doc: "Clear a player's pin (an unpinned user is ok, previous: null).",
    },
    {
      path: "pins",
      params: [],
      returns: "[{ user: { id, name, active }, actor: { id, name } | null, tokens: [{ id, scene, level, form }] }]",
      gm: false, writes: false,
      doc: "Every pin: the user, the pinned (root) actor, and its tokens on every scene (form: the token's actor name while wild-shaped or polymorphed).",
    },
    {
      path: "pinnedToken",
      params: [USER],
      returns: "{ token: uuid, actor: uuid, scene: id string, level: id string | null, x, y } | null",
      gm: false, writes: false,
      nullWhen: "the pinning switch is off, the user is a GM (even with a pin flag), the user is unpinned, or the pin has no token or more than one",
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "The token a pinned player's view follows. scene and level are id strings (pentaryn-resume reads it at login).",
    },
    {
      path: "pinnedTokens",
      params: [],
      returns: "{ [userId]: { token: uuid, actor: uuid, scene: id string, level: id string | null, x, y } }",
      gm: false, writes: false,
      since: "0.2.0",
      doc: "Every pinned player's pinnedToken in ONE walk over the world's tokens, keyed by user id: {} while the switch is off; "
        + "a GM, an unpinned user and a pin with no single token are absent. For a caller asking about several users at once.",
    },
    {
      path: "audit",
      params: [],
      returns: "{ enabled, ok, pins, violations: [{ code, level, user, actor, tokens: [{ id, scene, sceneName }], detail }] }",
      gm: false, writes: false,
      doc: "Each pinned actor has exactly one token across all scenes. Codes: GM_USER NO_ACTOR SHARED_ACTOR NO_TOKEN MANY_TOKENS "
        + "(problems), UNLINKED and NOT_OWNER (the player cannot observe the actor) (warnings). Runs whether or not the switch is on; this is the switch-on audit's API return. Deletes nothing.",
    },
    {
      path: "teleport",
      params: [USER, { name: "opts", type: "{ x, y, scene?, level?, dryRun = false }",
        doc: "x, y: canvas point on the destination; scene: id|uuid (default the token's own); level: the destination level id" }],
      returns: "the pentaryn-portals teleportToken result (pulled included) + { user, viewFollows, online, warning?: VIEW_UNCHANGED } | { ok: false, code, reason }",
      gm: true, writes: true, dryRun: true,
      sideEffects: ["through pentaryn-portals teleportToken: the pinned token and its company (summons, pets) moved",
        "switch on and the player online: teleportToken's pull names the player, so a cross-scene move pulls them (pullToScene)",
        "switch on and the player online: a same-scene move pulls them to the token's scene and level (pullToScene; a view of what is drawn draws nothing)"],
      doc: "Teleport a player's pinned character, with its summons and pets, to a point (portals teleportToken). "
        + "BAD_ARGS unpinned, NOT_FOUND no token, AMBIGUOUS several, UNSUPPORTED without pentaryn-portals (teleportToken). With the switch on "
        + "and the player online, portals pulls them on a cross-scene move (pull: [user]). viewFollows: cross-scene, portals' pulled names "
        + "the player; same scene, switch on, online and the pull sent; a dryRun, switch on and online. warning VIEW_UNCHANGED: a cross-scene move that did not "
        + "pull the player while they are online or the switch is off; an offline player with the switch on lands on the token's scene at login (resume).",
    },
    {
      path: "inspect",
      params: [{ name: "ref", kind: "user", resolve: "self", type: "User|Actor|uuid|id|exact name",
        doc: "a user or an actor; an id or name is tried as a user first" }],
      returns: "{ user, actor, root, enabled, token, ok }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only pin state for one user or actor, plain JSON, depth ≤ 4: who it is pinned to, the root actor, the token followed, ok = exactly one token. Options are ignored (the root game.pentaryn.inspect passes kind/sceneId/base to every namespace).",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync: the Scene#_onActivate patch installed, setting readable, portals teleportToken present.",
    },
  ],
  flags: {
    writes: ["flags.pentaryn-pins.actor"],
    reads: ["flags.dnd5e.originalActor", "flags.dnd5e.previousActorIds", "api:pentaryn-portals.teleportToken", "api:pentaryn-prompts.place",
      "hook:pentaryn-portals.prePull"],
  },
  unlisted: [],
});
