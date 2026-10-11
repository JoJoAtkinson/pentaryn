/**
 * Pentaryn Portal Cards — the API: the manifest's own rows, the kit members, describe().
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. The features' rows and
 * implementations arrive as contributions from their install() (ctx.contributions).
 */

import { HOOKS, NS } from "./portals-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { cardFor, lookAt, snapshot, teleportParty } from "./scene-adapter.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, { snapshot, cardFor, teleportParty, lookAt }, {
    contributions: ctx.contributions,
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(NS),
    }),
  });
}
