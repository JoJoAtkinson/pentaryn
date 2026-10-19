/**
 * pentaryn-importer — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs's implementations drift.
 *
 * `import` is a LEGACY row: it keeps its two-channel shape (a refusal THROWS; a per-actor failure
 * comes back in `{ ok: false, failed }`), documented here rather than reshaped (C31).
 *
 * Flags: the NPC import writes the generator's contract scope
 * `flags.pentaryn.*` (slug, contentHash, action, sources … — foundry/CONTRACT.md §9.2), which is
 * NEVER migrated: moving it would change every slug lookup and contentHash and force a full
 * re-import (decision D5, 2026-10-11). The DDB corrections (1.2.0) write the module's own
 * `flags.pentaryn-importer.ddbCorrections` stamp on a corrected character, and pentaryn-riders'
 * `stone` / `choice` flags on the Transmuter's Stone effects (riders reads `choice`).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./importer-core.mjs";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "import",
      params: [{
        name: "options", type: "ImportOptions", optional: true, resolve: false,
        doc: "{ path?, dryRun?, only?: slug[], force?, timeout? (ms, 15000), unmanagedItems?: \"keep\"|\"delete\" }",
      }],
      returns: "ImportResult { ok, path, url, dryRun, manifest, counts, created, updated, skipped, failed, deleteJson }",
      gm: true,
      writes: true,
      dryRun: true,
      legacy: true,
      throws: ["PentarynAbort", "PentarynAssertionError"],
      sideEffects: [
        "creates/updates world Actors",
        "replaces managed Items",
        "stamps flags.pentaryn.contentHash",
        "permanent toasts",
      ],
      doc: "Upsert the generated NPCs from worlds/<world>/actors.json. Run { dryRun: true } first. "
        + "A thrown PentarynAbort means nothing was written (version gate, @ref lint, malformed entry, "
        + "fetch, non-GM, a bad option, an import already running on this tab); a thrown "
        + "PentarynAssertionError means a readback failed and the batch is partial (actors before it "
        + "were written). A PentarynAbort carries a kit code: NOT_FOUND (no file at path), NOT_GM, "
        + "BAD_ARGS, CONFLICT (already running), TIMEOUT, else REFUSED. Per-actor write failures do "
        + "not throw: they come back as { ok: false, failed: [{ slug, error }] }.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false,
      writes: false,
      doc: "Live smoke checks after a sync: published, the module.json gate flags present, the legacy root.",
    },
    {
      path: "inspect",
      params: [
        { name: "ref", kind: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring" },
        { name: "opts", type: "{ sceneId?, base? }", optional: true },
      ],
      returns: "{ actor: { id, name }, ddb, importId, stamp: { importId, at, version, changes } | null, needsCorrection, frozen: string[] }",
      gm: false,
      writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      since: "1.2.0",
      doc: "Read-only DDB-correction state of one actor, plain JSON: whether it is a D&D Beyond character, "
        + "its ddb-importer importId, the stamp of its last correction, whether a sync came since, and "
        + "the items frozen against syncs (flags.ddbimporter.ignoreItemImport).",
    },
    {
      path: "ddbCorrections.plan",
      params: [{ name: "ref", kind: "actor", doc: "a D&D Beyond character (flags.ddbimporter): Actor, uuid, id or exact name" }],
      returns: "Promise<{ actor: { id, name }, importId, changes: [{ rule, op, item, itemId, summary, data }], notes: [{ rule, item, note }], frozen: string[], needsCorrection, enabled }>",
      gm: false,
      writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      since: "1.2.0",
      doc: "Dry run of the DDB corrections on one character: what each rule would change now (empty "
        + "changes = already correct). needsCorrection is true when the character was synced from D&D "
        + "Beyond since its last correction, or was last corrected by another importer version. BAD_ARGS for an actor without flags.ddbimporter.",
    },
    {
      path: "ddbCorrections.apply",
      params: [
        { name: "ref", kind: "actor", doc: "a D&D Beyond character: Actor, uuid, id or exact name" },
        { name: "opts", type: "{ dryRun? }", optional: true, doc: "dryRun: true returns the plan, writes nothing" },
      ],
      returns: "Promise<{ ok, changes, notes, frozen, applied: string[], errors: string[], stamped, reason } | fail>",
      gm: false,
      writes: true,
      dryRun: true,
      query: true,
      relay: true,
      since: "1.2.0",
      sideEffects: [
        "updates/retypes the character's Items",
        "deletes stale cached spell copies (flags.dnd5e.cachedFor) of repointed Cast activities",
        "creates ActiveEffects (flags.pentaryn-riders.stone, flags.pentaryn-riders.choice)",
        "updates the actor's base data",
        "stamps flags.pentaryn-importer.ddbCorrections",
        "a chat message whispered to the GMs when something changed",
      ],
      doc: "Apply the DDB corrections to one character now (what runs by itself after every ddb-importer "
        + "sync). Idempotent. A client that cannot update the actor relays it to the active GM, which applies "
        + "it only for a sender who owns the actor (else REFUSED). Runs "
        + "whatever the ddbCorrections setting says (the setting governs the automatic runs).",
    },
    {
      path: "ddbCorrections.rules",
      params: [],
      returns: "[{ id, label, doc }]",
      gm: false,
      writes: false,
      since: "1.2.0",
      doc: "The DDB correction rules, in the order they run.",
    },
  ],
  flags: {
    writes: [
      "flags.pentaryn.*",
      "flags.pentaryn-importer.ddbCorrections",
      "flags.pentaryn-riders.stone",
      "flags.pentaryn-riders.choice",
    ],
    reads: [
      "flags.ddbimporter.importId",
      "flags.ddbimporter.ignoreItemImport",
      "flags.dnd5e.cachedFor",
      "flags.pentaryn-riders.stone",
    ],
  },
  // published without a row (buildApi publishes a frozen copy of a plain object):
  //   moduleId — the module id; actorsContract — the actors.json contract the gate speaks
  //   (`contract` on a namespace is the API contract); _internals — the four helpers the root exposes.
  unlisted: ["moduleId", "actorsContract", "_internals"],
});
