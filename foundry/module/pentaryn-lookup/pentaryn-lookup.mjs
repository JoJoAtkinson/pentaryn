/**
 * Pentaryn Rules Lookup (pentaryn-lookup) — ENTRY: esmodules[0]. Wiring only, no logic.
 * Published as game.pentaryn.rules (and game.modules.get("pentaryn-lookup").api).
 *
 * Files, in load order:
 *   lookup-core.mjs        PURE constants, pack tables, search/page/monster rules
 *   packs-adapter.mjs      the only Foundry reads: game.packs, fromUuid, dnd5e.registry, enrichHTML
 *   api-manifest.mjs       PURE API rows (describe() reads them)
 *   api.mjs                buildApiFor(ctx), selftest()
 *   books.mjs              the feature: search, page, monster, monsters, names, packs, onList, spellList
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the feature installs synchronously at load (a migrating module, use-doc §5.2) ·
 * init → the GM-guarded CONFIG.queries (NOT_READY until ready publishes) ·
 * ready → build the API first (a drift throw stops there with one clear line), then publish.
 */

import { MODULE, NS } from "./lookup-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerQueries } from "./lib/queries.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApiFor } from "./api.mjs";
import * as books from "./books.mjs";

/** Features in load order. */
const FEATURES = [books];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const ctx = { log, reg, api: null, contributions: [], uninstall };

function install() {
  for (const feature of FEATURES) {
    const contribution = feature.install(reg, ctx);
    if (contribution) ctx.contributions.push(contribution);
  }
}

/** Remove every hook and feature state. */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

/** Every client registers the queries (a sender needs the name too); only a GM client answers. */
function onInit() {
  registerQueries(MANIFEST, () => ctx.api, { log });
}

/**
 * `game.pentaryn` is a plain object every module assigns into (the importer merges into it), so
 * publishNamespace assigns `rules` into it; a frozen root throws here and Foundry reports it.
 */
function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  const lookups = MANIFEST.rows.filter(row => row.query).length;
  console.log(`pentaryn-lookup | game.pentaryn.rules ready — ${lookups} lookups (describe() lists them), selftest()`);
}

install();
Hooks.once("init", onInit);
Hooks.once("ready", onReady);
