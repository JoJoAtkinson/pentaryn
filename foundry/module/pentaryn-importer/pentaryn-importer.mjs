/**
 * pentaryn-importer — Stage 2 of the Pentaryn ⇄ Foundry pipeline: upserts the NPC Actors that
 * `scripts/foundry/build_actors.py` wrote to `actors.json`. Contract: `foundry/CONTRACT.md`.
 * The design note (silent failure modes, the `flags.pentaryn` scope, API citations) heads
 * importer-core.mjs.
 *
 * ENTRY (esmodules[0]): wiring only. Files:
 *   importer-core.mjs      PURE constants, error classes, lint, payload shaping, version-gate rules
 *   documents-adapter.mjs  Foundry glue: fetch, gate/lint refusals, readback assertions, writes, summary
 *   api.mjs                importActors, the orchestrator
 *   pentaryn-importer.mjs  this file: the ready publish
 */

import { CONTRACT_ID, MODULE, lintFormulas, normalise, valuesMatch } from "./importer-core.mjs";
import { fetchJsonWithTimeout, log } from "./documents-adapter.mjs";
import { importActors } from "./api.mjs";

/* -------------------------------------------------------------------------------------------- */
/*  Registration                                                                                  */
/* -------------------------------------------------------------------------------------------- */

Hooks.once("ready", () => {
  game.pentaryn = Object.freeze({
    /** @type {typeof importActors} */
    import: importActors,
    moduleId: MODULE,
    contract: CONTRACT_ID,
    /** Exposed for tests and for hand-checking a file without importing it. */
    _internals: Object.freeze({ fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise })
  });
  log.info(`ready — game.pentaryn.import() available (${CONTRACT_ID})`);
});
