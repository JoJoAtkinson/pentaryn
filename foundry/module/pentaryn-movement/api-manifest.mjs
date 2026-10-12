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
        + "sceneId, version, settings: { <key>: scope } }",
      gm: false, writes: false, legacy: true,
      doc: "Why ghost is or isn't on for this client on a scene (opts.sceneId, default the viewed one): the GM "
        + "policy, whether a combat there stops ghosting, this client's button (wish), whether the two core methods "
        + "are wrapped, and every setting key with its scope (ghost and ownedOnTop are client settings).",
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
      params: [{ name: "on", type: "boolean" }],
      returns: "Promise<void>",
      gm: false, writes: true, legacy: true,
      sideEffects: ["setting pentaryn-movement.ghost (client)"],
      doc: "Switch ghost on or off for yourself, like the player's button. Player clients only: on a GM "
        + "client (and so from the MCP bridge) it sets the GM's own client setting, which changes nothing for players.",
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
        + "player); player-owned tokens first. [] without a scene or for an unknown scene id.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync: published, settings readable, both core methods wrapped, hooks registered.",
    },
  ],
  flags: { writes: [], reads: [] },
  unlisted: ["core"],
});
