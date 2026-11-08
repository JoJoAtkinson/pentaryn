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
        + "sceneId, version, settings: { <key>: scope }, combatExempt: string[] }",
      gm: false, writes: false, legacy: true,
      doc: "Why ghost is or isn't on for this client on a scene (opts.sceneId, default the viewed one): the GM "
        + "policy, whether a combat there stops ghosting, this client's button (wish), whether the two core methods "
        + "are wrapped, every setting key with its scope (ghost and ownedOnTop are client settings), and combatExempt: the ids "
        + "of your tokens there that may ghost through the fight (incorporeal feat or the GM's flag; [] when no fight blocks).",
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
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync: published, settings readable, both core methods wrapped, hooks registered.",
    },
  ],
  flags: { writes: ["flags.pentaryn-movement.ghostInCombat"], reads: [] },
  unlisted: ["core"],
});
