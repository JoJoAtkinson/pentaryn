/**
 * Pentaryn Token Name Sync (pentaryn-names) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Renaming an actor renames its token labels; a label that is a nickname is left alone
 * (README "What the player sees").
 *
 * Files, in load order:
 *   names-core.mjs     PURE constants, HOOKS ({}), the relabel rules and the token planner
 *   api-manifest.mjs   PURE data: the three legacy API rows
 *   rename.mjs         the feature: preUpdateActor / updateActor, and sync()
 *   lib/*.mjs          vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: module body → features install (migrating module: synchronously, so the hooks are
 * registered in today's order) · ready → build the API (a manifest drift throws here) and
 * publish it on module.api and game.pentaryn.names.
 */

import { HOOKS, MODULE, NS, relabel, shortName } from "./names-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApi } from "./lib/api.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace, publishedOf } from "./lib/publish.mjs";
import * as rename from "./rename.mjs";

/** Features in load order. */
const FEATURES = [rename];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = { log, reg, uninstall };

function install() {
  for (const feature of FEATURES) feature.install(reg, ctx);
}

/** Remove every hook and feature state. */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

function onReady() {
  // The arrow keeps the published function's name "sync" (golden/surface.json).
  const api = buildApi(MANIFEST, { sync: (ref, oldName, newName) => rename.syncRef(ref, oldName, newName), relabel, shortName }, {
    members: { uninstall, trace: () => log.traces() },
    extras: () => ({
      hooks: reg.ids().map(h => ({ name: h.name, label: h.label })),
      events: HOOKS,
      published: publishedOf(NS),
    }),
  });
  // publishNamespace rebuilds a frozen game.pentaryn (pentaryn-importer) rather than assigning into it.
  publishNamespace(NS, api, { moduleId: MODULE });
}

install();
if (globalThis.game?.ready) onReady();
else Hooks.once("ready", onReady);
