/**
 * Pentaryn Tool Cursors (pentaryn-cursors) — ENTRY: esmodules[0]. Wiring only, no logic.
 * The mouse pointer on the map shows which scene tool is active.
 *
 * Files, in load order:
 *   cursors-core.mjs     PURE constants, KEYS, keyFor, cursorValues, probeInternals, statusOf
 *   settings.mjs         SETTINGS table (the one client row), setting()
 *   board.mjs            the feature: install(reg, ctx) / uninstall() — all canvas glue
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: init → settings · load → board installs synchronously (migration rule: the hook
 * order of today) · ready → publish; the board attaches a tick later.
 *
 * Hook order is pinned (test/golden/hooks.json): `once init` first, then the board's hooks, then
 * `once ready` last — so init is registered before install() and ready after it.
 */

import { HOOKS, KEYS, MODULE, VERSION, keyFor } from "./cursors-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { registerSettings, setting } from "./settings.mjs";
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
  setTimeout(() => {
    const api = { refresh: () => ctx.exposed.refresh(), current: () => ctx.exposed.current(), keys: KEYS, keyFor };
    const existing = game.pentaryn;
    if (existing && !Object.isExtensible(existing)) game.pentaryn = { ...existing, cursors: api };
    else { game.pentaryn ??= {}; game.pentaryn.cursors = api; }
  }, 0);
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
