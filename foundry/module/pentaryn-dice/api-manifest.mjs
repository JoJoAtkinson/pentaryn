/**
 * Pentaryn Dice — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Everything acts for the calling client's user, on Dice So Nice's persistent dice.
 */

import { CONTRACT, MAX_COUNT, MODULE, NS, VERSION } from "./dice-core.mjs";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "spawn",
      params: [{ name: "opts", type: "{ type: string, count?: number, dryRun?: boolean }", optional: true,
        doc: `type: a die name ("d6", "d20", "d100"); count: 1..${MAX_COUNT}, default 1; dryRun: only say what would spawn` }],
      returns: "{ ok, requested, spawned, stopped } | { ok: false, code, reason }",
      gm: false, writes: true, dryRun: true,
      sideEffects: ["Dice So Nice persistent dice (its own user flags, broadcast to every client)"],
      doc: "Spawn count persistent dice of one type for the calling user, through Dice So Nice's own "
        + "persistent.spawn (so they sync and are saved). A d100 spawns as its linked pair. Stops at "
        + "Dice So Nice's dice cap.",
    },
    {
      path: "selectMine",
      params: [{ name: "opts", type: "{ type?: string }", optional: true,
        doc: "type: only dice of this type (a d100 pair counts as a d100)" }],
      returns: "number",
      gm: false, writes: false,
      doc: "Add the calling user's persistent dice (all, or one type) to Dice So Nice's selection on "
        + "this client and redraw the outlines. Returns how many dice are selected now.",
    },
    {
      path: "clearSelection",
      params: [],
      returns: "number",
      gm: false, writes: false,
      doc: "Clear Dice So Nice's persistent-dice selection on this client. Returns how many were selected.",
    },
    {
      path: "status",
      params: [],
      returns: "{ enabled, dsnActive, persistentDice, mine, selected, shortcut, internals }",
      gm: false, writes: false,
      doc: "Read-only diagnosis: the setting, whether Dice So Nice and its persistent dice are on, how "
        + "many dice this user has, the selection by type, the shortcut's label and the internals check.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: { name, ok, detail }[] }",
      gm: false, writes: false,
      doc: "Check that the six Dice So Nice internals this module uses still exist (run after a Dice So "
        + "Nice update). Needs Dice So Nice's persistent dice setting on.",
    },
  ],
  flags: { writes: [], reads: [] },
});
