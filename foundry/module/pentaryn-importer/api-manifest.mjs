/**
 * pentaryn-importer — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs's implementations drift.
 *
 * `import` is a LEGACY row: it keeps its two-channel shape (a refusal THROWS; a per-actor failure
 * comes back in `{ ok: false, failed }`), documented here rather than reshaped (C31).
 *
 * Flags: the importer owns no `flags.pentaryn-importer.*`. It writes the generator's contract scope
 * `flags.pentaryn.*` (slug, contentHash, action, sources … — foundry/CONTRACT.md §9.2), which is
 * NEVER migrated: moving it would change every slug lookup and contentHash and force a full
 * re-import (decision D5, 2026-10-11).
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
  ],
  flags: { writes: ["flags.pentaryn.*"], reads: [] },
  // published without a row (buildApi publishes a frozen copy of a plain object):
  //   moduleId — the module id; actorsContract — the actors.json contract the gate speaks
  //   (`contract` on a namespace is the API contract); _internals — the four helpers the root exposes.
  unlisted: ["moduleId", "actorsContract", "_internals"],
});
