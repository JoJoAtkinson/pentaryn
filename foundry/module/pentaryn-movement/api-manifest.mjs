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
        + "group: { enabled, fight, patched: { drop, click }, regime, limits, groups, last, fallbacks, stopped, cut, step, undo, told, pending, wave, flushed, perf }, "
        + "stop: { last }, "
        + "assist: { tripped }, migrated }",
      gm: false, writes: false, legacy: true,
      doc: "Why ghost is or isn't on for this client on a scene (opts.sceneId, default the viewed one): the GM "
        + "policy, whether a combat there stops ghosting, this client's button (wish), whether the two core methods "
        + "are wrapped, every setting key with its scope (ghost and ownedOnTop are client settings), and combatExempt: the ids "
        + "of your tokens there that may ghost through the fight (incorporeal feat or the GM's flag; [] when no fight blocks). "
        + "group (0.4.0; 0.9.0 the drop): drag help on this client — enabled (tier B, groupDrags), fight (false: a group drag in a fight is refused with a notice in 0.9.0), "
        + "whether the drop and click wraps are in, the regime of your controlled tokens (combat when one is in a started combat, else free), the "
        + "limits, how many groups this client holds (a click on one member stops them all), the last drop (mode, reason, result, ms, async, stacked, plan) "
        + "and the last few reasons a drop went to core; stopped: the last stop of a group; cut: the last wall raised or door shut that stopped moves this client drives (out of combat, where drawn); "
        + "step (0.8.3): the last next square of a move this client drove that it did not send (why: wall, standing, unrendered, wallUnrendered); undo (0.8.3): the last move whose undo entries were merged into one; "
        + "told (0.9.0): the last notices this client showed (kind, reason, text); pending (0.9.0): the file's waves this client still has to send ([{ gid, at, ids }]); "
        + "wave: the last later wave it sent (members, sent, skipped: no longer at their start, shut: a wall across their way, short); flushed: the last hidden-tab flush (members); "
        + "perf: drops handled, the last and longest (ms). stop.last (0.4.11): this client's last "
        + "click-stop (tokenId, name, how, via: click / board / door / api, members, whole), or null. "
        + "assist.tripped (0.8.0): the circuit breaker's trip on this client ({ at, why }) or null; migrated: what migrateSettings carried over at ready.",
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
      returns: "{ mode, mine, smoothCorners: true, patched, gridType, memo, limits, last: { at, tokenId, legs, found, nodes, ms, reached, of, arcs, improved, async, memo } | null }",
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
      returns: "{ ok, result: \"plan\" | \"core\", ms, passes, order, starts, total, "
        + "members: [{ id, name, slot: { x, y }, waypoints, stay, delay }] } | { ok: false, code, reason }",
      gm: false, writes: false,
      since: "0.4.0",
      doc: "Dry run of a group drop out of combat (0.9.0 the file): each member's rest slot (top-left pixels), its route's "
        + "waypoint count, why it stays when it does (stay: noSpot, noRoute, through, budget; null when it goes or "
        + "is at its spot already) and its start delay (ms after the drop; null when it does not move); the plan's time, passes, the order "
        + "members were planned in, the start order (starts) and the last start (total, at most 4000). Nothing moves. Needs a "
        + "drawn canvas (a browser tab, not the headless GM). NOT_FOUND / BAD_ARGS / NO_CANVAS as a refusal object.",
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
        + "token (NOT_INITIATOR / NOT_OWNER otherwise). Stopping a member of a group stops the whole group: on the client "
        + "that sent it every member and its unsent waves; elsewhere this one, and the dragger's screen "
        + "stops the rest. Never held back by the 400 ms arming a click waits for. NOT_MOVING when it "
        + "is not moving or you cannot control it.",
    },
    {
      path: "telemetry",
      params: [{ name: "opts", type: "{ seconds?: number }", optional: true, doc: "only the events of the last that many seconds (default: all kept)" }],
      returns: "{ user, summary: { counts, plan: { n, medianMs, p95Ms, maxMs }, fallbacks, notices, firesPerPlan, failures }, tripped, events: [{ n, t, ago, kind, ... }], filed }",
      gm: false, writes: false,
      since: "0.8.0",
      doc: "This client's drag-help telemetry (a ring buffer of the last 400 events): plans with their time, "
        + "fallbacks to core's move, frame stalls while it moved tokens, stops, cuts, notices (their reason codes) "
        + "and errors; the circuit breaker's state.",
    },
    {
      path: "reportTelemetry",
      params: [],
      returns: "Promise<{ ok: true, to, summary } | { ok: false, code, reason }>",
      gm: false, writes: true,
      since: "0.8.0",
      sideEffects: ["a whispered ChatMessage to the GMs"],
      doc: "Whisper this client's telemetry summary to the logged-in GMs (after a session). NO_GM when none is logged in.",
    },
    {
      path: "fileWrongMove",
      params: [],
      returns: "Promise<pentaryn-feedback submit's answer: { ok: true, id, status } | { ok: false, code, reason }>",
      gm: false, writes: true,
      since: "0.8.0",
      sideEffects: ["a bug report queued on this user and filed by the GM (pentaryn-feedback)"],
      doc: "What the \"That move was wrong\" key (Alt+W by default) does: files the last ten seconds of this client's drag "
        + "telemetry, with the last drop's record, as a Bug through pentaryn-feedback. NO_FEEDBACK when that module is not active.",
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
