/**
 * Pentaryn Ping Log (pentaryn-pings) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Foundry keeps no ping history; this writes the last N pings (yours and your players') into a
 * world setting, so "put a monster where I pinged" works from a tool that cannot watch the canvas.
 * GM clients only: game.pentaryn.pings.last() / recent(n) / all() / clear() (README "API").
 *
 * Files, in load order:
 *   pings-core.mjs     PURE constants and rules: dedupe, cap, image offset, decorate, recent
 *   settings.mjs       SETTINGS (log store, max) and the only game.settings calls
 *   api-manifest.mjs   PURE data: the four legacy API rows
 *   capture.mjs        the feature: handlePing wrap, userActivity listener, buffer + flush
 *   lib/*.mjs          vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: module body → features install (registers no hook) · init → settings, every client ·
 * ready → GM clients only: capture.start(), build the API, publish on module.api and
 * game.pentaryn.pings, the "ready — N ping(s)" line.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.pings.uninstall()`, then
 * `await import("/modules/pentaryn-pings/pings.mjs?v=2")`. Any edit to another file needs a reload.
 */

import { MODULE, NS, decorate, imageOffset, recentOf } from "./pings-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, readLog, registerSettings, settingsView } from "./settings.mjs";
import { buildApi } from "./lib/api.mjs";
import { isAnyGM } from "./lib/election.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { makeLog } from "./lib/log.mjs";
import { patches } from "./lib/patch.mjs";
import { publishNamespace, publishedOf } from "./lib/publish.mjs";
import * as capture from "./capture.mjs";

/** Features in load order. */
const FEATURES = [capture];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const ctx = { log, reg, uninstall };

function install() {
  for (const feature of FEATURES) feature.install(reg, ctx);
}

/** Remove every hook, the wrap, the listener and the buffer (hot patch: then re-import the entry). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

const readSetting = () => readLog({ log });

/** The plain scene fields core's imageOffset/decorate need; an unknown scene → no offset, grid 100. */
function sceneInfo(sceneId) {
  const scene = game.scenes.get(sceneId);
  const gridSize = scene?.grid?.size;
  return {
    offset: imageOffset(scene ? { width: scene.width, height: scene.height, padding: scene.padding, gridSize } : null),
    gridSize,
  };
}

function decorated(rec) {
  if (!rec) return null;
  return decorate(rec, sceneInfo(rec.sceneId), Date.now());
}

/** The four legacy methods (api-manifest.mjs rows). The readers read the store, not the buffer. */
const impl = {
  last: () => decorated(readSetting().at(-1)),
  recent: (n = 10) => recentOf(readSetting(), n).map(decorated),
  all: () => readSetting().map(decorated),
  clear: () => capture.clear(),
};

function onInit() {
  registerSettings();
}

function onReady() {
  if (!isAnyGM()) return;

  capture.start();

  const api = buildApi(MANIFEST, impl, {
    members: { uninstall, trace: () => log.traces(), settings: settingsView },
    extras: () => ({
      settings: SETTINGS,
      hooks: reg.ids().map(h => ({ name: h.name, label: h.label })),
      patches: patches().filter(p => p.moduleId === MODULE),
      published: publishedOf(NS),
    }),
  });
  // publishNamespace rebuilds a frozen game.pentaryn (pentaryn-importer) rather than assigning into it.
  publishNamespace(NS, api, { moduleId: MODULE, when: "ready:gm" });

  console.log(`${MODULE} | ready — ${readSetting().length} ping(s) on record`);
}

install();
if (globalThis.game?.ready) {
  // a hot re-import after the world is ready: run the phases now (rows already registered are skipped)
  onInit();
  onReady();
} else {
  Hooks.once("init", onInit);
  Hooks.once("ready", onReady);
}
