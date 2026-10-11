/**
 * Pentaryn Tool Cursors — the API: implementations for the manifest rows.
 *
 * GLUE. May import core, settings and lib — never a feature file. The board's state reaches this
 * file through `ctx.exposed` (what board.mjs passed to `ctx.expose()` in its install()).
 */

import { HOOKS, KEYS, NS, keyFor, statusOf } from "./cursors-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    refresh: () => ctx.exposed.refresh(),
    current: () => ctx.exposed.current(),
    keyFor,
    keys: KEYS,
    status: () => statusOf(ctx.exposed.snapshot()),
  }, {
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
