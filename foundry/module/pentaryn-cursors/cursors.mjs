/**
 * Pentaryn Tool Cursors (pentaryn-cursors) — ENTRY: esmodules[0]. Wiring only, no logic.
 * The mouse pointer on the map shows which scene tool is active.
 *
 * Files, in load order:
 *   cursors-core.mjs     PURE constants, KEYS, keyFor, cursorValues, probeInternals, statusOf
 *   settings.mjs         SETTINGS table (the one client row), setting()
 *   api-manifest.mjs     PURE API rows (describe() reads them)
 *   api.mjs              implementations, buildApiFor(ctx)
 *   board.mjs            the feature: install(reg, ctx) / uninstall() — all canvas glue
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: init → settings · load → board installs synchronously (migration rule: the hook
 * order of today) · ready → build the API (a drift throw stops here with one clear line), publish
 * synchronously; the board attaches a tick later.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.cursors.uninstall()`, then
 * `await import(".../cursors.mjs?v=2")`. Its static imports resolve to the instances already
 * loaded, so it re-registers the same handlers and republishes the same code. Any edit to
 * board, core, api or settings needs a reload.
 *
 * Hook order is pinned (test/golden/hooks.json): `once init` first, then the board's hooks, then
 * `once ready` last — so init is registered before install() and ready after it.
 */

import { HOOKS, MODULE, NS, VERSION } from "./cursors-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import * as board from "./board.mjs";

/** Features in load order. */
const FEATURES = [board];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = {
  log,
  reg,
  setting,
  emit: emitter(MODULE, HOOKS, { log, version: VERSION }),
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
  registerSettings({ log, onChange: board.onEnabledChange });
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

if (globalThis.game?.ready) {
  // a hot re-import after the world is ready: run the phases now, in order
  onInit();
  install();
  onReady();
} else {
  Hooks.once("init", onInit);
  install();
  Hooks.once("ready", onReady);
}
