/**
 * Pentaryn Player Journal (pentaryn-journal) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * An "Add to my journal" bar under every eye readable copies what the player was shown, GM secrets
 * stripped, into their own personal journal (README "What the player sees").
 *
 * Files, in load order:
 *   journal-core.mjs     PURE constants and rules: sanitize, planSave, status, the visibility rules
 *   settings.mjs         SETTINGS (gmButton, singlePageReadables, folderName), setting(), whenChanged()
 *   sources-adapter.mjs  windows, documents and Item Piles' pile data → targets and descriptors
 *   personal.mjs         FEATURE: personal journals — lookup, folder, ensure*, report, the relay
 *   bar.mjs              FEATURE: the bar, saving, the glow, single-page eyes, provenance
 *   api.mjs              the published methods, over what the features expose
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: init → settings, the relay query (every client: the sender needs the name too) ·
 * module body → features install, synchronously, so listeners keep their order against other
 * modules · ready → the active GM's ensureAll starts (personal.mjs), then the API is built and
 * published at once on module.api and game.pentaryn.journal (D2).
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.journal.uninstall()`, then
 * `await import("/modules/pentaryn-journal/journal.mjs?v=2")`. Any edit to another file needs a reload.
 */

import { MODULE, NS } from "./journal-core.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { makeLog } from "./lib/log.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import * as personal from "./personal.mjs";
import * as bar from "./bar.mjs";

/** Features in load order. */
const FEATURES = [personal, bar];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = {
  log,
  reg,
  setting,
  api: null,
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  uninstall,
};

function install() {
  for (const feature of FEATURES) feature.install(reg, ctx);
}

/** Remove every hook and feature state (hot patch: then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

function onInit() {
  registerSettings();
  personal.registerRelay();
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
  // a hot re-import after the world is ready: run the phases now (rows already registered are skipped)
  install();
  onInit();
  onReady();
} else {
  Hooks.once("init", onInit);
  install();
  Hooks.once("ready", onReady);
}
