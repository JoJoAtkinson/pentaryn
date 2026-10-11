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
      path: "list", params: [{ name: "n", type: "number", optional: true, doc: "default 20" }],
      returns: "Entry[]", gm: false, writes: false, legacy: true,
      doc: "The last n entries, newest first.",
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
  ],
  flags: {
    writes: ["flags.pentaryn-dropbin.corpse", "flags.pentaryn-dropbin.sight", "flags.pentaryn-dropbin.ownership",
      "flags.item-piles.data.lockedSound"],
    reads: ["flags.item-piles.data"],
  },
});
