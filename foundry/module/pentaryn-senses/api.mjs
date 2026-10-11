/**
 * Pentaryn Senses — the API: the manifest rows bound to what the features exposed.
 *
 * GLUE. Imports core, settings, the manifest and lib — never a feature file. The features reach
 * this file through `ctx.exposed` (what each passed to `ctx.expose()` in its install()):
 *   carried  syncLight, carriedLight, syncAll
 *   migrate  resetSight
 *   light    light  = { cast, end, pick, toggle, hood, profileFor, sweep, setup, onMe, prompt, reconcile }
 *   chain    chain  = { link, break, links, repaint }
 * The functions are published as they are (no wrappers), so their names are today's.
 */

import { HOOKS, NS, PHB_LIGHT_ACTOR, SPELL_LIGHT } from "./senses-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const ex = ctx.exposed;
  const light = ex.light, chain = ex.chain;
  return buildApi(MANIFEST, {
    syncLight: ex.syncLight,
    carriedLight: ex.carriedLight,
    resetSight: ex.resetSight,
    ...Object.fromEntries(Object.entries(light).map(([k, fn]) => [`light.${k}`, fn])),
    setupLight: light.setup,
    syncAll: ex.syncAll,
    ...Object.fromEntries(Object.entries(chain).map(([k, fn]) => [`chain.${k}`, fn])),
    "light.SPELL_LIGHT": SPELL_LIGHT,
    "light.PHB_LIGHT_ACTOR": PHB_LIGHT_ACTOR,
  }, {
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
