/**
 * Pentaryn Movement — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Every published path from before the migration keeps its signature (`legacy: true`). `core` (the
 * pure module) is published unlisted, as a frozen copy.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./movement-core.mjs";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "status",
      params: [{ name: "opts", type: "{ sceneId?: string | Scene } | string | Scene", optional: true,
        doc: "a scene id or Scene, bare or as opts.sceneId; default: the viewed scene" }],
      returns: "{ policy, combatOnScene, allowed, reason, wish, ghost, ownedOnTop, patched: { drag, keyboard }, "
        + "sceneId, version, settings: { <key>: scope }, combatExempt: string[], "
        + "group: { enabled, clickToStop, patched: { drop, click }, regime, limits, groups, last, fallbacks, resumed, stopped, destacked, cut } }",
      gm: false, writes: false, legacy: true,
      doc: "Why ghost is or isn't on for this client on a scene (opts.sceneId, default the viewed one): the GM "
        + "policy, whether a combat there stops ghosting, this client's button (wish), whether the two core methods "
        + "are wrapped, every setting key with its scope (ghost and ownedOnTop are client settings), and combatExempt: the ids "
        + "of your tokens there that may ghost through the fight (incorporeal feat or the GM's flag; [] when no fight blocks). "
        + "group (0.4.0): group movement and click to stop on this client — the two settings, whether the drop and click "
        + "wraps are in, the regime of your controlled tokens (combat when one is in a started combat, else free), the "
        + "limits, groups still sending waves, the last drop (mode, reason, result, ms, async, waves, relaxed, replans) "
        + "and the last few reasons a drop went to core; resumed / stopped / destacked / cut (0.4.6): when a reload last "
        + "picked up unsent waves, a turn change last stopped a group, the rest check last moved a member off another, "
        + "a door shut or a wall raised last cut moves this client started.",
    },
    {
      path: "ghostFor",
      params: [{ name: "token", type: "Token placeable | TokenDocument" }],
      returns: "boolean",
      gm: false, writes: false, legacy: true,
      doc: "Is ghost movement in effect for that token on this client (a player, owner, button on, allowed)? "
        + "Always false on a GM client.",
    },
    {
      path: "combatActive",
      params: [{ name: "sceneId", type: "string | Scene", optional: true,
        doc: "a scene id or a Scene; default: the viewed scene" }],
      returns: "boolean",
      gm: false, writes: false, legacy: true,
      doc: "Does a combat stop ghosting on that scene (an active encounter there with a visible combatant, "
        + "or started)? Hidden combatants do not count.",
    },
    {
      path: "setGhost",
      params: [
        { name: "on", type: "boolean | Actor | Token | TokenDocument | uuid | id | exact name",
          doc: "a boolean: your own button (legacy); a creature reference: the GM's ghost-in-combat override for it" },
        { name: "opts", type: "{ combat: boolean }", optional: true,
          doc: "with a creature reference only: combat true sets flags.pentaryn-movement.ghostInCombat, false clears it" },
      ],
      returns: "Promise<void> (boolean) | Promise<{ ok, uuid, name, ghostInCombat, feat } | { ok: false, code, reason }> (reference)",
      gm: false, writes: true, legacy: true,
      sideEffects: ["setting pentaryn-movement.ghost (client)", "flags.pentaryn-movement.ghostInCombat (actor; GM, reference form)"],
      doc: "setGhost(true|false): switch ghost on or off for yourself, like the player's button (player clients only: on a GM "
        + "client, and so from the MCP bridge, it sets the GM's own client setting, which changes nothing for players). "
        + "setGhost(creature, { combat }): GM only — let that creature's owner ghost it during a fight (the actor flag "
        + "ghostInCombat; a token's synthetic actor keeps it on that token); NOT_GM, NOT_FOUND, AMBIGUOUS or BAD_ARGS as a refusal object. "
        + "A feat named Incorporeal Passage / Incorporeal Movement / Ethereal grants the same without the flag.",
    },
    {
      path: "setPolicy",
      params: [{ name: "value", type: '"off" | "exploration" | "always"', doc: "anything else means exploration" }],
      returns: "Promise",
      gm: true, writes: true, legacy: true,
      sideEffects: ["setting pentaryn-movement.ghostPolicy (world)", "setting pentaryn-movement.ghostPolicyLast (world)"],
      doc: "GM: set the player ghost policy. Rejects with Error('GM only') on a player client (legacy: a throw, "
        + "not a refusal object). A mode other than off is also remembered for the GM toolbar button.",
    },
    {
      path: "pinsUnderTokens",
      params: [{ name: "scene", type: "Scene | string", optional: true,
        doc: "a Scene or a scene id; default: the viewed scene" }],
      returns: "{ noteId, label, tokenId, tokenName, playerOwned }[]",
      gm: false, writes: false, legacy: true,
      doc: "Map pins whose centre sits under a visible token (owned-on-top makes them unclickable for that "
        + "player); player-owned tokens first. A pin limited to other scene levels than the token's is skipped. "
        + "[] without a scene or for an unknown scene id.",
    },
    {
      path: "inspect",
      params: [{ name: "ref", kind: "actor", type: "Actor | Token | TokenDocument | uuid | id | exact name",
        doc: "a creature; a token gives its own (synthetic) actor" }],
      returns: "{ uuid, name, flag, feat, ghostInCombat }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      since: "0.2.0",
      doc: "Read-only ghost-in-combat state of one creature, plain JSON: flag (the GM override flags.pentaryn-movement.ghostInCombat), "
        + "feat (the incorporeal feat's name, or null) and ghostInCombat (either grants it). Options are ignored.",
    },
    {
      path: "pathfind.status",
      params: [],
      returns: "{ mode, mine, smoothCorners, patched, gridType, memo, limits, last: { at, tokenId, legs, found, nodes, ms, reached, of, arcs, improved, async, memo } | null }",
      gm: false, writes: false,
      since: "0.3.0",
      doc: "Drag pathfinding on this client: the world mode (everyone / gm / off), this client's two settings, whether "
        + "Token#findMovementPath is wrapped, the step-cache size, the search limits, and what the last search did "
        + "(nodes expanded, ms, explicit waypoints reached of how many, arcs placed, whether it beat the straight drag).",
    },
    {
      path: "pathfind.route",
      params: [
        { name: "ref", kind: "token", type: "Token | TokenDocument | uuid | id | exact name", doc: "a token on the scene this client's canvas shows" },
        { name: "opts", type: "{ to: { x, y }, preview?: boolean, smooth?: boolean }",
          doc: "to: the destination top-left in pixels; preview: count only walls this user has seen (default false); smooth: corner arcs (default this client's setting)" },
      ],
      returns: "{ ok, reached, straight, waypoints: [{ x, y, explicit }], cost, arcs, legs: [{ state, nodes, corners, arcs }], ms } | { ok: false, reason }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      since: "0.3.0",
      doc: "Dry run of a drag: the path the pathfinder would give that token to opts.to, without moving it. Needs a drawn "
        + "canvas (a browser tab, not the headless GM). straight: the plain drag already got there; cost in feet as the ruler measures it.",
    },
    {
      path: "planGroup",
      params: [
        { name: "refs", type: "(Token | TokenDocument | uuid | id | exact name)[]",
          doc: "the tokens, the first being the one grabbed (the anchor); all drawn on this canvas" },
        { name: "point", type: "{ x, y }", doc: "the anchor's drop point, top-left pixels; the others keep their offsets" },
      ],
      returns: "{ ok, result: \"plan\" | \"core\", reason, combat, constricted, formation, replans, relaxed, ms, "
        + "members: [{ id, name, core, level, delay, slot: { x, y }, waypoints }] } | { ok: false, code, reason }",
      gm: false, writes: false,
      since: "0.4.0",
      doc: "Dry run of a group drop: each member's rest slot (top-left pixels), start delay (ms), how hard it was "
        + "(level 0 a delay, 1 a lateral re-plan, 2 go last, 3 relaxed: may brush another while moving; \"core\": no "
        + "route, left to core) and the route's waypoint count. Nothing moves. Needs a drawn canvas (a browser tab, "
        + "not the headless GM). NOT_FOUND / BAD_ARGS / NO_CANVAS as a refusal object.",
    },
    {
      path: "stop",
      params: [
        { name: "ref", kind: "token", type: "Token | TokenDocument | uuid | id | exact name", doc: "a moving token" },
        { name: "opts", type: "{}", optional: true, doc: "none yet" },
      ],
      returns: "Promise<{ ok: true, how: \"displace\" | \"stop\", tokenId } | { ok, how: \"stop\", tokenId } (relay) | { ok: false, code, reason }>",
      gm: false, writes: true, query: true, relay: true,
      since: "0.4.0",
      sideEffects: ["Token position (displace, out of combat)", "the token's pending movement (stopMovement, in combat)"],
      doc: "Stop a moving token as a click on it would: out of combat it is put where it is drawn; in a started combat "
        + "the client that started the move stops it at the next square (stopMovement). A GM asks that client directly "
        + "(the pentaryn-movement.stopOwn query: GM sender only), so a GM may stop any move; a player asks the "
        + "active GM through this row's relay, which stops it only when it started the move and the sender owns the "
        + "token (NOT_INITIATOR / NOT_OWNER otherwise). Stopping a member of a group this client sent stops the group "
        + "and cancels its unsent waves. Never held back by the 400 ms arming a click waits for. NOT_MOVING when it "
        + "is not moving or you cannot control it.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync: published, settings readable, the core methods wrapped (drag, keyboard, "
        + "pathfinding, group drop, click to stop), hooks registered.",
    },
  ],
  flags: { writes: ["flags.pentaryn-movement.ghostInCombat"], reads: [] },
  unlisted: ["core"],
});
