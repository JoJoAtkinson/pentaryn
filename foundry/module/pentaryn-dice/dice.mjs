/**
 * Pentaryn Dice (pentaryn-dice) — ENTRY: esmodules[0]. Wiring only, no logic.
 * Dice So Nice persistent-dice helpers: count boxes, select buttons and a select-all shortcut.
 *
 * Files, in load order:
 *   dice-core.mjs        PURE constants, INTERNALS, rules (idsToSelect, spawnGroups, …)
 *   settings.mjs         SETTINGS / KEYBINDINGS tables, setting()
 *   dsn-adapter.mjs      the only file touching game.dice3d
 *   api-manifest.mjs     PURE API rows (describe() reads them)
 *   api.mjs              implementations, buildApiFor(ctx)
 *   sidebar.mjs          the feature: install(reg, ctx) / uninstall(), the shortcut's handler
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: init → the setting and the keybinding · setup → features install · ready → build the
 * API first (a drift throw stops here with one clear line), then publish. No GM-only startup.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.dice.uninstall()`, then
 * `await import(".../dice.mjs?v=2")`. Only this entry's URL changes; its static imports
 * (features, api, settings, core, lib/) resolve to the module instances already loaded, so the
 * re-run registers the SAME handlers again and republishes the same code as a new API object.
 * Any edit to a feature, core, api or settings file needs a reload — and settings/keybinding rows
 * already registered are skipped, so new rows need a reload too.
 */

import { HOOKS, MODULE, NS, VERSION } from "./dice-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import * as sidebar from "./sidebar.mjs";

/** Features in load order. */
const FEATURES = [sidebar];

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
  registerSettings({ log, onChange: sidebar.onEnabledChange, onSelectAll: sidebar.onSelectAllKey });
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
