/**
 * Pentaryn Drop Bin — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Every row published before the migration keeps its signature (`legacy: true`): `restore`
 * returns the Notification its refusal toasted or the created Item; `export`/`clear` return
 * false for a player. No first param is named `ref`, so nothing is resolved per call.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./dropbin-core.mjs";

const TOKEN_DOC = { name: "tokenDoc", type: "TokenDocument", resolve: false };
const ACTOR = { name: "actor", type: "Actor", resolve: false };
const APP = { name: "app", type: "ItemPileInventoryApp", resolve: false, doc: "an open Item Piles loot window" };
const N = { name: "n", type: "number|string", doc: "the ledger number" };

const corpseRow = (path, params, returns, doc, extra = {}) => ({ path, params, returns, gm: false, writes: false, legacy: true, doc, ...extra });

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    corpseRow("corpses.sync", [ACTOR], "Promise<void>",
      "Active GM: turn each eligible token of the actor into a corpse pile (dead) or back (alive). No-op elsewhere or without Item Piles.",
      { gm: true, writes: true, sideEffects: ["Item Piles pile flags", "flags.pentaryn-dropbin.corpse", "flags.pentaryn-dropbin.sight", "flags.pentaryn-dropbin.ownership", "delta.ownership", "sight.enabled", "ActiveEffect (Dead)"] }),
    corpseRow("corpses.toCorpse", [TOKEN_DOC], "Promise<void>",
      "Make this token a lootable corpse pile now (players get OBSERVER on its delta; sight off; Dead as the overlay).",
      { gm: true, writes: true, sideEffects: ["Item Piles pile flags", "flags.pentaryn-dropbin.corpse", "flags.pentaryn-dropbin.sight", "flags.pentaryn-dropbin.ownership", "delta.ownership", "sight.enabled", "ActiveEffect (Dead)"] }),
    corpseRow("corpses.fromCorpse", [TOKEN_DOC], "Promise<void>",
      "Turn a corpse we made back into a creature: revert the pile, give back its sight and pre-death delta ownership.",
      { gm: true, writes: true, sideEffects: ["Item Piles pile flags", "flags.pentaryn-dropbin.*", "delta.ownership", "sight.enabled"] }),
    corpseRow("corpses.isDead", [ACTOR], "boolean",
      "Dead by the corpse rule: hp 0 or below with hp.max > 0, or the dead status."),
    corpseRow("corpses.revive", [TOKEN_DOC], "Promise<void>",
      "The HUD's Revive: clear Dead, raise hp to 1, then sync (the pile reverts).",
      { gm: true, writes: true, sideEffects: ["ActiveEffect (Dead)", "system.attributes.hp.value"] }),
    corpseRow("corpses.paintEye", [{ name: "token", type: "Token", resolve: false, doc: "the canvas placeable" }], "void",
      "Draw or hide the lootable eye on one token (this client only; no document)."),
    corpseRow("corpses.paintAllEyes", [], "void", "paintEye on every token of the viewed scene."),
    corpseRow("corpses.migrateLegacyEyes", [], "Promise<void>",
      "Active GM: remove the pre-overlay 'Lootable' effects and make Dead the overlay. Runs once at ready.",
      { gm: true, writes: true, sideEffects: ["ActiveEffect (Lootable, removed)", "flags.core.overlay"] }),
    corpseRow("loot.install", [APP], "boolean", "Add (or repaint) the Loot all button in one open loot window; false when it cannot."),
    corpseRow("loot.refreshAll", [], "void", "Repaint every tracked Loot all button."),
    corpseRow("loot.recipientFor", [APP], "Actor | null",
      "Who Loot all would loot into: the window's recipient, else the user's character, else their first owned character (players)."),
    {
      path: "all", params: [], returns: "Entry[]", gm: false, writes: false, legacy: true,
      doc: "The whole ledger, oldest first. Each entry carries the item's complete source (large).",
    },
    {
      path: "list",
      params: [{ name: "n", type: "number", optional: true, doc: "default 20" },
        { name: "opts", type: "{ brief? }", optional: true, doc: "brief: true → {n, iso, reason, itemName, itemType, quantity, fromActorName, sceneName, pileUuid}, no item source" }],
      returns: "Entry[] | Brief[]", gm: false, writes: false, legacy: true,
      doc: "The last n entries, newest first. Pass {brief: true} for a compact listing (full entries carry the item source).",
    },
    {
      path: "get", params: [N], returns: "Entry | null", gm: false, writes: false, legacy: true,
      nullWhen: "no entry has that number",
      doc: "One entry by its ledger number.",
    },
    {
      path: "search", params: [{ name: "text", type: "string" }], returns: "Entry[]", gm: false, writes: false, legacy: true,
      doc: "Entries whose item name contains text, case-insensitive (oldest first).",
    },
    {
      path: "restore",
      params: [N, { name: "target", type: "Actor|id|exact name", optional: true, resolve: false, doc: "default: the actor it left" }],
      returns: "Promise<Item | Notification>", gm: true, writes: true, legacy: true,
      sideEffects: ["Item (created on the target actor)"],
      doc: "GM: recreate entry #n on the actor it left (or target) and toast. A refusal returns the warn/error Notification it showed.",
    },
    {
      path: "export", params: [], returns: "Promise<boolean>", gm: true, writes: true, legacy: true,
      sideEffects: ["assets/drop-bin/drop-log.json"],
      doc: "GM: write the JSON mirror now and toast; false for a player or on failure.",
    },
    {
      path: "clear", params: [], returns: "Promise<boolean>", gm: true, writes: true, legacy: true,
      sideEffects: ["setting pentaryn-dropbin.log", "assets/drop-bin/drop-log.json"],
      doc: "GM: after a confirm dialog, empty the ledger and the mirror. The counter is kept: numbers are never reused.",
    },
    {
      path: "restoreResult",
      params: [N, { name: "target", type: "Actor|id|exact name", optional: true, resolve: false, doc: "default: the actor it left" }],
      returns: '{ ok: true, item, actor } | { ok: false, reason: "not-gm" | "no-entry" | "no-actor" }',
      gm: true, writes: true, since: "0.2.2",
      sideEffects: ["Item (created on the target actor)"],
      doc: "restore() without toasts: the created Item, or why not. Use this from scripts and the bridge.",
    },
    {
      path: "inspect",
      params: [{ name: "ref", kind: "token", type: "Token|TokenDocument|Actor|uuid|id|exact name", resolve: false,
        doc: "a token (by uuid, id or exact name; never a substring), or an Actor (its tokens on every scene, or opts.sceneId)" }],
      returns: "{ token, actor, dead, corpse, noLoot, pile, saved } | { actor, dead, noLoot, pile, corpses: [...] }",
      gm: false, writes: false, since: "0.2.2",
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only, plain JSON: whether this token (or this actor's tokens) is a corpse we made, its saved sight and pre-death ownership, noLoot, and Item Piles' flag data.",
    },
    {
      path: "selftest", params: [], returns: "{ ok, checks: [{ label, ok, detail }] }", gm: false, writes: false, since: "0.2.2",
      doc: "Live smoke checks after a sync.",
    },
  ],
  flags: {
    writes: ["flags.pentaryn-dropbin.corpse", "flags.pentaryn-dropbin.sight", "flags.pentaryn-dropbin.ownership",
      "flags.item-piles.data.lockedSound"],
    reads: ["flags.item-piles.data"],
  },
});
