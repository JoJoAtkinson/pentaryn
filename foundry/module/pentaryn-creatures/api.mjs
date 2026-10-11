/**
 * Pentaryn Creatures — the API: implementations for the manifest rows.
 *
 * GLUE. Imports core, the adapter, settings and lib — never a feature file. The features' state
 * reaches this file through `ctx.exposed` (what each passed to `ctx.expose()` in install()).
 */

import * as core from "./creatures-core.mjs";
import { HOOKS, MODULE, NS, isPlayerCreature } from "./creatures-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { summarize } from "./tokens-adapter.mjs";
import { buildApi } from "./lib/api.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { toIdSet } from "./lib/resolve.mjs";

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const x = ctx.exposed;
  return buildApi(MANIFEST, {
    list: (user, scene) => x.list(user, scene),
    render: () => x.render(),
    // ids at the boundary: an array, a Set (copied), one id or token documents → a Set; null/undefined = all
    syncScene: (scene, ids) => x.syncScene(scene, ids == null ? null : toIdSet(ids)),
    syncAll: () => x.syncAll(),
    isCreature: (tokenDoc) => isPlayerCreature(summarize(tokenDoc)),
    // a TokenDocument answers for its placeable on the viewed scene (a document off-canvas: false)
    ownerSees: (token) => x.ownerSees(token?.object ?? token),
    patchedWith: () => x.patchedWith(),
    core,
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
      patches: patches().filter(p => p.moduleId === MODULE),
      published: publishedOf(NS),
    }),
  });
}
