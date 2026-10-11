/**
 * pentaryn-importer — Stage 2 of the Pentaryn ⇄ Foundry pipeline: upserts the NPC Actors that
 * `scripts/foundry/build_actors.py` wrote to `actors.json`. Contract: `foundry/CONTRACT.md`.
 * The design note (silent failure modes, the `flags.pentaryn` scope, API citations) heads
 * importer-core.mjs.
 *
 * ENTRY (esmodules[0]): wiring only. Files, in load order:
 *   importer-core.mjs      PURE constants, error classes, lint, payload shaping, version-gate rules
 *   documents-adapter.mjs  Foundry glue: fetch, gate/lint refusals, readback assertions, writes,
 *                          the console summary, and the module's one logger
 *   api-manifest.mjs       PURE API rows (describe() reads them)
 *   api.mjs                importActors, the orchestrator; buildApiFor (the kit-built API)
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * No features, no settings, no UI: the one hook is `ready`, which publishes. There is no hot-patch
 * branch — a re-import registers a fresh once:ready and publishes on the next ready, as it always did.
 */

import { CONTRACT_ID, MODULE, lintFormulas, normalise, valuesMatch } from "./importer-core.mjs";
import { fetchJsonWithTimeout, log } from "./documents-adapter.mjs";
import { buildApiFor, importActors } from "./api.mjs";
import { hookRegistry } from "./lib/hooks.mjs";

const reg = hookRegistry(MODULE, log);

const ctx = { log, reg, api: null, uninstall: () => reg.offAll() };

function onReady() {
  game.pentaryn = Object.freeze({
    /** @type {typeof importActors} */
    import: importActors,
    moduleId: MODULE,
    contract: CONTRACT_ID,
    /** Exposed for tests and for hand-checking a file without importing it. */
    _internals: Object.freeze({ fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise })
  });
  ctx.log.info(`ready — game.pentaryn.import() available (${CONTRACT_ID})`);
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    ctx.log.error("API manifest drift — not published", err);
    return;
  }
  const mod = game.modules.get(MODULE);
  if (mod) mod.api = ctx.api;
}

reg.once("ready", onReady, { label: "ready: publish" });
