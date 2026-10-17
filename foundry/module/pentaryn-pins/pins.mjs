/**
 * Pentaryn Pins (pentaryn-pins) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Files, in load order:
 *   pins-core.mjs     PURE constants, HOOKS, rules
 *   settings.mjs           SETTINGS table, setting()
 *   api-manifest.mjs       PURE API rows (describe() reads them)
 *   world-adapter.mjs      Foundry → plain data: pins, root actors, tokens across scenes, the audit
 *   api.mjs                implementations, inspect(), selftest()
 *   follow.mjs             a pinned player ignores activation (Scene#_onActivate patch); the safety net,
 *                          the level gap-filler and the dropped-pull replay (core's own pull moves them)
 *   sheet.mjs              "Pinned to {player}" on the actor sheet
 *   canvas-menu.mjs        the GM right-click canvas menu (menu-ui.mjs builds its DOM)
 *   switch.mjs             switching pinning on audits the pins and pulls the online pinned players
 *   watch.mjs              GM toasts when a pinned character has no token left, or a second one; the
 *                          active GM pulls the player when it is placed again (0 → 1 token)
 *   prepull.mjs            pentaryn-portals.prePull listener: a player pinned elsewhere is left out of a pull
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: init → settings · setup → features install (follow.mjs patches Scene#_onActivate and
 * listens to core's pullToScene before the first canvas draw) · ready → build the API first (a drift throw stops here with a clear line),
 * publish. `ready` is registered here, at import, so the API is published before any listener a
 * module adds during `setup` (pentaryn-resume's `ready: resume` reads `pinnedToken`).
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.pins.uninstall()`, then
 * `await import(".../pins.mjs?v=2")`. Only this entry's URL changes; its static imports
 * (features, api, settings, core, lib/) resolve to the module instances already loaded, so the
 * re-run registers the SAME handlers again and republishes the same code as a new API object.
 * Use it to recover after an uninstall or a failed publish. Any edit to a feature, core, api or
 * settings file needs a reload — and settings/keybinding rows already registered are skipped,
 * so new rows need a reload too.
 */

import { HOOKS, MODULE, NS, VERSION } from "./pins-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerQueries } from "./lib/queries.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApiFor } from "./api.mjs";
import * as follow from "./follow.mjs";
import * as sheet from "./sheet.mjs";
import * as canvasMenu from "./canvas-menu.mjs";
import * as switchAudit from "./switch.mjs";
import * as watch from "./watch.mjs";
import * as prePull from "./prepull.mjs";

/** Features in load order. */
const FEATURES = [follow, sheet, canvasMenu, switchAudit, watch, prePull];

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
  registerSettings({ log });
  registerQueries(MANIFEST, () => ctx.api, { log });
}

function onSetup() {
  install();
}

function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  // contributed rows register their queries now; the manifest's were registered at init
  registerQueries({ module: MODULE, rows: ctx.contributions.flatMap(c => c.rows ?? []) }, () => ctx.api, { log });
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
}

if (globalThis.game?.ready) {
  // a hot re-import after the world is ready: the lifecycle hooks have already fired, so run the
  // phases now, in order. Settings and keybindings already registered are skipped by the kit.
  onInit();
  onSetup();
  onReady();
} else {
  Hooks.once("init", onInit);
  Hooks.once("setup", onSetup);
  Hooks.once("ready", onReady);
}
