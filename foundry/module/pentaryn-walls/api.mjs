/**
 * Wall autocomplete — the API: the manifest rows bound to the actions feature's exposed functions,
 * plus the pure engine and registry.
 *
 * GLUE. Imports core, settings, the manifest and lib — never a feature file. The actions reach
 * this file through `ctx.exposed` (what actions.mjs passed to `ctx.expose()` in its install()).
 */

import { HOOKS, NS, available, runEngine } from "./walls-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const ex = ctx.exposed;
  return buildApi(MANIFEST, {
    preview: (...args) => ex.preview(...args),
    run: (...args) => ex.run(...args),
    undo: (...args) => ex.undo(...args),
    makeMacro: (...args) => ex.makeMacro(...args),
    runEngine,
    backends: available,
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
