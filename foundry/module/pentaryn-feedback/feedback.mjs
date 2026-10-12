/**
 * Pentaryn Feedback (pentaryn-feedback) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Files, in load order:
 *   feedback-core.mjs     PURE constants, HOOKS, rules
 *   settings.mjs           SETTINGS table, setting()
 *   api-manifest.mjs       PURE API rows (describe() reads them)
 *   api.mjs                implementations, inspect(), selftest(), the GM's list/get/resolve
 *   recorder.mjs           FEATURE: the action and error rings (every client)
 *   reporter.mjs           FEATURE: the bug button, /bug, submit, the queue, the GM's filing
 *   dialog.mjs             WIDGET: the report dialog (ApplicationV2)
 *   snapshot-adapter.mjs   ADAPTER: live game → plain context JSON
 *   files-adapter.mjs      ADAPTER: the report files under Data/pentaryn-feedback/
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: init → settings and CONFIG.queries · setup → features install · ready → build the
 * API first (a drift throw stops here with a clear line), publish, then GM-only startup.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.feedback.uninstall()`, then
 * `await import(".../feedback.mjs?v=2")`. Only this entry's URL changes; its static imports
 * (features, api, settings, core, lib/) resolve to the module instances already loaded, so the
 * re-run registers the SAME handlers again and republishes the same code as a new API object.
 * Use it to recover after an uninstall or a failed publish. Any edit to a feature, core, api or
 * settings file needs a reload — and settings/keybinding rows already registered are skipped,
 * so new rows need a reload too.
 */

import { HOOKS, MODULE, NS, VERSION } from "./feedback-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerQueries } from "./lib/queries.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApiFor } from "./api.mjs";
import { fileStore, hasStore, useStore } from "./files-adapter.mjs";
import * as recorder from "./recorder.mjs";
import * as reporter from "./reporter.mjs";

/** Features in load order: the recorder first, so the reporter's doors see its rings. */
const FEATURES = [recorder, reporter];

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
  // the shared report store logs through the module (debug only); a store already active is kept
  if (!hasStore()) useStore(fileStore({ log }));
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
  // GM-only startup (filing every user's waiting reports) is the reporter's own `ready` listener,
  // behind isActiveGM().
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
