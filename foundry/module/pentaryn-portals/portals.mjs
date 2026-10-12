/**
 * Pentaryn Portal Cards (pentaryn-portals) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Destination cards in core's teleport dialog, travel badges above the darkness, the GM's Portal
 * card window and Teleport party, and summons that follow a PC through a scene link (README "What
 * the player sees"). Card data lives on the DESTINATION region: flags.pentaryn-portals.{title, img,
 * description}.
 *
 * Files:
 *   portals-core.mjs   PURE: constants, party and landing rules, card HTML, geometry
 *   settings.mjs       SETTINGS, setting()
 *   scene-adapter.mjs  ADAPTER: documents → records, snapshot, region move, party teleport, linking
 *   card-app.mjs       UI: the Portal card window
 *   party.mjs          FEATURE: summons follow, arrivals step off an occupied square
 *   badges.mjs         FEATURE: travel badges, hover card, GM menu, drag-to-move
 *   cards.mjs          FEATURE: teleport-dialog cards, Teleport as default, Region-config fieldset
 *   lib/*.mjs          vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: module body → the features install, synchronously, party → badges → cards (every hook
 * is registered at evaluation, as before the split; golden/hooks.json) · init → settings ·
 * ready → build the API first (a manifest drift stops there with one error line), then publish it
 * on module.api and game.pentaryn.portals at once, with the pentaryn-portals.ready and
 * pentaryn.ready events.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.portals.uninstall()`, then
 * `await import("/modules/pentaryn-portals/portals.mjs?v=2")`. Any edit to another file needs a reload.
 */

import { MODULE, NS } from "./portals-core.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { configureSceneAdapter } from "./scene-adapter.mjs";
import { buildApiFor } from "./api.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import * as party from "./party.mjs";
import * as badges from "./badges.mjs";
import * as cards from "./cards.mjs";

/** Features in load order. */
const FEATURES = [party, badges, cards];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const ctx = { log, reg, setting, api: null, contributions: [], uninstall };

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

configureSceneAdapter({ setting, log });
for (const feature of FEATURES) {
  const contribution = feature.install(reg, ctx);
  if (contribution) ctx.contributions.push(contribution);
}

if (globalThis.game?.ready) {
  // a hot re-import after the world is ready: run the phases now (settings already registered are skipped)
  onInit();
  onReady();
} else {
  Hooks.once("init", onInit);
  Hooks.once("ready", onReady);
}
