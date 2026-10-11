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
 * No features, no settings, no UI: the one hook is `ready`, which publishes (module.api, the
 * `game.pentaryn.importer` alias, and the legacy root keys merged into `game.pentaryn`). There is no hot-patch
 * branch — a re-import registers a fresh once:ready and publishes on the next ready, as it always did.
 */

import { CONTRACT_ID, MODULE, NS } from "./importer-core.mjs";
import { log } from "./documents-adapter.mjs";
import { buildApiFor, legacyRoot } from "./api.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";

const reg = hookRegistry(MODULE, log);

const ctx = { log, reg, api: null, uninstall: () => reg.offAll() };

/**
 * Build the API first (a drift throw stops here with one clear line), then MERGE the legacy root
 * keys into `game.pentaryn` — never replace or freeze it ([declared] items-journal-1, D-I1) — and
 * publish the namespace. The root keys land before `publishNamespace` fires `pentaryn.ready`, so a
 * listener on it already sees `game.pentaryn.import`.
 */
function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    ctx.log.error("API manifest drift — not published", err);
    return;
  }
  game.pentaryn ??= {};
  Object.assign(game.pentaryn, legacyRoot());
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  ctx.log.info(`ready — game.pentaryn.import() available (${CONTRACT_ID})`);
}

reg.once("ready", onReady, { label: "ready: publish" });
