/**
 * Pentaryn Movement (pentaryn-movement) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Two fixes from the 2026-10-08 table feedback (plan C2): a player's own tokens draw on top on
 * their screen, and a ghost button lets a player move their own tokens through walls and creatures
 * under a GM policy. Why it needs no GM relay, and what it wraps: README "How it works".
 *
 * Files, in load order:
 *   movement-core.mjs    PURE constants, label key maps, the policy / sort / pin rules
 *   settings.mjs         SETTINGS table, setting(), onSettingChange()
 *   combat-adapter.mjs   combats and scenes → plain core inputs (reads only)
 *   api-manifest.mjs     PURE API rows (describe() reads them)
 *   api.mjs              implementations, selftest()
 *   ghost.mjs            the feature: install(reg, ctx) / uninstall()
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the feature installs synchronously in this body (where its module-scope Hooks.on
 * calls always ran, so listener order is unchanged) · init → settings · setup → the feature wraps
 * the two core methods · ready → build the API first (a drift throw stops here with one clear
 * line), then publish it as game.modules.get("pentaryn-movement").api and game.pentaryn.movement.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.movement.uninstall()`, then
 * `await import("/modules/pentaryn-movement/movement.mjs?v=2")`. Any edit to another file needs a
 * reload.
 */

import { MODULE, NS } from "./movement-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { onSettingChange, registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import * as ghost from "./ghost.mjs";

/** Features in load order. */
const FEATURES = [ghost];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = {
  log,
  reg,
  setting,
  onSettingChange,
  /** true on a hot re-import after `ready`: the lifecycle hooks have already fired. */
  late: !!globalThis.game?.ready,
  api: null,
  contributions: [],
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  uninstall,
};

function install() {
  for (const feature of FEATURES) {
    const contribution = feature.install(reg, ctx);
    if (contribution) ctx.contributions.push(contribution);
  }
}

/** Remove every hook and feature state (hot patch: then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

function onInit() {
  registerSettings();
}

function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
}

// Registration order is the module's historic one: init, then the feature's hooks (installed
// synchronously, at the moment its module-scope Hooks.on calls used to run), then ready.
if (ctx.late) {
  onInit();
  install();
  onReady();
} else {
  Hooks.once("init", onInit);
  install();
  Hooks.once("ready", onReady);
}
