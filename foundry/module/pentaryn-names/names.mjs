/**
 * Pentaryn Token Name Sync (pentaryn-names) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Renaming an actor renames its token labels; a label that is a nickname is left alone
 * (README "What the player sees").
 *
 * Files, in load order:
 *   names-core.mjs     PURE constants, HOOKS ({}), the relabel rules and the token planner
 *   rename.mjs         the feature: preUpdateActor / updateActor, and sync()
 *   lib/*.mjs          vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: module body → features install (migrating module: synchronously, so the hooks are
 * registered in today's order) · ready → publish.
 */

import { MODULE, relabel, shortName } from "./names-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
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

// pentaryn-importer creates and FREEZES game.pentaryn, so rebuild it rather than assign into it.
function onReady() {
  const api = { sync: rename.sync, relabel, shortName };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, names: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.names = api;
  }
}

install();
if (globalThis.game?.ready) onReady();
else Hooks.once("ready", onReady);
