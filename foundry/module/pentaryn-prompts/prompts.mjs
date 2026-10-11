/**
 * pentaryn-prompts — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * A prompt marker is a hidden token Joe drops on a map with a few words on it ("goblin boss,
 * wolf-skull helm"). Later one gather call hands Claude every prompt with its surroundings, and
 * one replace call turns each marker into the real thing. See README.md and
 * context/foundry/prompt-markers.md.
 *
 * Files:
 *   prompts-core.mjs, geometry-core.mjs (barrel of core/*.mjs), build-core, npc-core,
 *   readback-core, typeahead-core     PURE
 *   settings.mjs           SETTINGS, the keybinding rows, setting(), the manifest ring
 *   *-adapter.mjs          Foundry ↔ plain data: markers, scene, sight, crops, packs, character,
 *                          actor-patch, npc, typeahead
 *   dialog.mjs, tip-ui.mjs UI: the prompt box, the hover tip
 *   gather.mjs, replace.mjs the gather / crops / list / show and replace calls
 *   features (FEATURES, in hook order): typeahead, marker-guard, placement, hud-button, tooltip,
 *                          panels, patches
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: `init` is registered FIRST (settings, keybindings, queries); the features install
 * synchronously in this body, so every listener keeps its place (golden/hooks.json); `setup` →
 * the double-click patch; `ready` → build the API, publish it (synchronously, `when: "ready"`), then
 * ensure the six marker actors.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.prompts.uninstall()`, then
 * `await import("/modules/pentaryn-prompts/prompts.mjs?v=2")` — and fire the phases by hand; any edit
 * to another file needs a reload.
 */

import { MODULE, NS } from "./prompts-core.mjs";
import { ensureMarkers } from "./markers-adapter.mjs";
import { gather, crops, list, show } from "./gather.mjs";
import { replace, replaceMany } from "./replace.mjs";
import { registerSettings, registerKeybindings, keybindingRows, setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { registerQueries } from "./lib/queries.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApiFor } from "./api.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import * as typeahead from "./typeahead.mjs";
import * as markerGuard from "./marker-guard.mjs";
import * as placement from "./placement.mjs";
import * as hudButton from "./hud-button.mjs";
import * as tooltip from "./tooltip.mjs";
import * as panels from "./panels.mjs";
import * as patches from "./patches.mjs";

/** Features in today's hook order (golden/hooks.json). */
const FEATURES = [typeahead, markerGuard, placement, hudButton, tooltip, panels, patches];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = {
  log,
  reg,
  setting,
  api: null,
  contributions: [],
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  uninstall,
};

function install() {
  // gather/crops/list/show and replace/replaceMany are the glue files' own functions (their rows are
  // in the manifest); placement and patches contribute through ctx.expose
  ctx.contributions.push({ rows: [], impl: { gather, crops, list, show, replace, replaceMany } });
  for (const feature of FEATURES) {
    const contribution = feature.install(reg, ctx);
    if (contribution) ctx.contributions.push(contribution);
  }
}

/** Remove every hook and feature state. */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

/* ── lifecycle ──────────────────────────────────────────────────────────── */

function onInit() {
  registerSettings();
  registerKeybindings(keybindingRows({ place: placement.onPlaceKey, edit: placement.onEditKey }), { log });
  // GM-guarded on the sender and the receiver (kit guarded); a query before the publish is NOT_READY
  registerQueries(MANIFEST, () => ctx.api, { log });
}

/**
 * Build the API (a manifest drift stops here with one error line), publish it at once on
 * module.api and game.pentaryn.prompts (the kit fires pentaryn-prompts.ready and pentaryn.ready),
 * then ensure the six marker actors — the publish never waits for them, and a publish that throws
 * (a frozen root) still lets them be ensured.
 */
function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  try {
    publishNamespace(NS, ctx.api, { moduleId: MODULE });
  } catch (err) {
    log.error("publish failed", err);
  }
  return ensureMarkers().catch(err => { log.error("ensureMarkers failed", err); });
}

// the lifecycle hooks are the entry's own (as the template's): init first, then the features, then ready
Hooks.once("init", onInit);
install();
Hooks.once("ready", onReady);
