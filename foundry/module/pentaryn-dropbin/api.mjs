/**
 * Pentaryn Drop Bin — the API: implementations of the manifest rows over `ctx.exposed` (what the
 * ledger, corpses and loot features exposed), and buildApiFor(ctx). May import core, adapters,
 * settings and lib — never a feature file.
 */

import * as core from "./dropbin-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

function impl(ctx) {
  const { ledger, corpses, loot } = ctx.exposed;
  return {
    "corpses.sync": corpses.sync,
    "corpses.toCorpse": corpses.toCorpse,
    "corpses.fromCorpse": corpses.fromCorpse,
    "corpses.isDead": corpses.isDead,
    "corpses.revive": corpses.revive,
    "corpses.paintEye": corpses.paintEye,
    "corpses.paintAllEyes": corpses.paintAllEyes,
    "corpses.migrateLegacyEyes": corpses.migrateLegacyEyes,
    "loot.install": loot.install,
    "loot.refreshAll": loot.refreshAll,
    "loot.recipientFor": loot.recipientFor,
    all: ledger.all,
    list: ledger.list,
    get: ledger.get,
    search: ledger.search,
    restore: ledger.restore,
    export: ledger.export,
    clear: ledger.clear,
  };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, impl(ctx), {
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: core.HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(core.NS),
    }),
  });
}
