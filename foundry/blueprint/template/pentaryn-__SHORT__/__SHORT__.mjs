/**
 * __Title__ (pentaryn-__SHORT__) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Files, in load order:
 *   __SHORT__-core.mjs     PURE constants, HOOKS, rules
// @if full
 *   settings.mjs           SETTINGS table, setting()
 *   api-manifest.mjs       PURE API rows (describe() reads them)
 *   api.mjs                implementations, inspect(), selftest()
// @endif
 *   example-feature.mjs    a feature: install(reg, ctx) / uninstall()
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: init → settings and CONFIG.queries · setup → features install · ready → build the
 * API first (a drift throw stops here with a clear line), publish, then GM-only startup.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.__NS__.uninstall()`, then
 * `await import(".../__SHORT__.mjs?v=2")`. Only this entry's URL changes; its static imports
 * (features, api, settings, core, lib/) resolve to the module instances already loaded, so the
 * re-run registers the SAME handlers again and republishes the same code as a new API object.
 * Use it to recover after an uninstall or a failed publish. Any edit to a feature, core, api or
 * settings file needs a reload — and settings/keybinding rows already registered are skipped,
 * so new rows need a reload too.
 */

import { HOOKS, MODULE, NS, VERSION } from "./__SHORT__-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
// @if full
import { registerQueries } from "./lib/queries.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApiFor } from "./api.mjs";
// @endif
// @if small
import { CONTRACT } from "./__SHORT__-core.mjs";
import { CODES, KIT_VERSION } from "./lib/errors.mjs";
import { publishedOf } from "./lib/publish.mjs";
// @endif
import * as exampleFeature from "./example-feature.mjs";

/** Features in load order. */
const FEATURES = [exampleFeature];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = {
  log,
  reg,
  // @if full
  setting,
  // @endif
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
// @if small

/**
 * A small module's API: the kit-owned members only. describe() has the same keys as a full
 * module's (use-doc §5.1a "describe() keys") — empty where a small module has nothing — so game.pentaryn.describe()
 * and the offline tools read every namespace the same way.
 */
function buildSmallApi() {
  return Object.freeze({
    version: VERSION,
    contract: CONTRACT,
    describe: () => ({
      module: MODULE,
      namespace: NS,
      version: VERSION,
      contract: CONTRACT,
      flagScope: MODULE,
      kit: KIT_VERSION,
      published: publishedOf(NS),
      methods: [],
      queries: [],
      settings: [],
      events: Object.entries(HOOKS).map(([key, e]) => ({
        key, name: e.name, legacyName: e.legacyName ?? null, ...(e.until ? { until: e.until } : {}),
        pre: !!e.pre, args: e.args ?? "",
      })),
      hooks: reg.ids().map(h => ({ name: h.name, label: h.label })),
      patches: [],
      flags: { writes: [], reads: [] },
      errors: [...CODES],
    }),
    settings: () => ({}),
    trace: () => log.traces(),
    uninstall,
  });
}
// @endif
// @if full

function onInit() {
  registerSettings({ log });
  registerQueries(MANIFEST, () => ctx.api, { log });
}
// @endif

function onSetup() {
  install();
}

function onReady() {
  // @if full
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  // contributed rows register their queries now; the manifest's were registered at init
  registerQueries({ module: MODULE, rows: ctx.contributions.flatMap(c => c.rows ?? []) }, () => ctx.api, { log });
  // @endif
  // @if small
  ctx.api = buildSmallApi();
  // @endif
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  // GM-only startup goes here, guarded by isActiveGM() from lib/election.mjs
  // (vendor it first: vendor.py sync __SHORT__ --kit election).
}

if (globalThis.game?.ready) {
  // a hot re-import after the world is ready: the lifecycle hooks have already fired, so run the
  // phases now, in order. Settings and keybindings already registered are skipped by the kit.
  // @if full
  onInit();
  // @endif
  onSetup();
  onReady();
} else {
  // @if full
  Hooks.once("init", onInit);
  // @endif
  Hooks.once("setup", onSetup);
  Hooks.once("ready", onReady);
}
