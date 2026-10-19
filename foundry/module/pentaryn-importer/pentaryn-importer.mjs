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
 *   create-watch.mjs       FEATURE: a createActor watch held only for one create's round trip
 *   settings.mjs           SETTINGS (ddbCorrections), setting()
 *   ddb-core.mjs           PURE DDB-correction rules (planCorrections, the stamp)
 *   ddb-adapter.mjs        a live Actor → the rules' snapshot, the lookups, the writes
 *   ddb-corrections.mjs    FEATURE: the ddb-importer sync listener, the GM-ready sweep, plan/apply
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Two features, one setting, no UI. Module-scope hooks: `init` (the setting, and the relay query
 * every client registers — the sender needs the name too) and `ready`, which installs the features
 * (the create watch registers nothing until an import creates an actor; the DDB corrections listen on
 * ddb-importer's `characterProcessDataComplete`), publishes (module.api, the `game.pentaryn.importer`
 * alias, and the legacy root keys merged into `game.pentaryn`), then starts the DDB sweep on the
 * active GM. There is no hot-patch branch — a re-import registers fresh once:init/once:ready hooks
 * and publishes on the next ready, as it always did.
 */

import { CONTRACT_ID, MODULE, NS } from "./importer-core.mjs";
import { log } from "./documents-adapter.mjs";
import { buildApiFor, legacyRoot } from "./api.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { registerSettings } from "./settings.mjs";
import * as createWatch from "./create-watch.mjs";
import * as ddbCorrections from "./ddb-corrections.mjs";
import { isActiveGM } from "./lib/election.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerQueries } from "./lib/queries.mjs";

/**
 * The module's hook registry: the DDB sync listener from ready; the create watch only while a create
 * is in flight. The lifecycle hooks are module-scope `Hooks.once`.
 */
const reg = hookRegistry(MODULE, log);

/** Features in install order. */
const FEATURES = [createWatch, ddbCorrections];

const ctx = {
  log, reg, api: null, exposed: {},
  uninstall: () => { reg.offAll(); for (const f of [...FEATURES].reverse()) f.uninstall(); }
};

/** The setting, and the `ddbCorrections.apply` relay query (every client: a sender needs the name). */
function onInit() {
  registerSettings();
  registerQueries(MANIFEST, () => ctx.api, { log });
}

/**
 * Build the API first (a drift throw stops here with one clear line), then MERGE the legacy root
 * keys into `game.pentaryn` — never replace or freeze it ([declared] items-journal-1, D-I1) — and
 * publish the namespace. The root keys land before `publishNamespace` fires `pentaryn.ready`, so a
 * listener on it already sees `game.pentaryn.import`.
 */
function onReady() {
  for (const feature of FEATURES) feature.install(reg, ctx);
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
  if (isActiveGM()) {
    void ctx.exposed.ddb.sweep().then(
      out => { if (out.corrected.length) ctx.log.info(`DDB sweep — corrected ${out.corrected.join(", ")}`); },
      err => ctx.log.warn("DDB sweep failed", err));
  }
}

Hooks.once("init", onInit);
Hooks.once("ready", onReady);
