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
 * the double-click patch; `ready` → publish, then ensure the six marker actors.
 */

import { MODULE, VERSION, SIZE_KEYS, codedError } from "./geometry-core.mjs";
import { SPEC_DIR } from "./prompts-core.mjs";
import { ensureMarkers, markerActor } from "./markers-adapter.mjs";
import { sceneModel } from "./scene-adapter.mjs";
import { gather, crops, list, show } from "./gather.mjs";
import { replace, replaceMany } from "./replace.mjs";
import { registerSettings, registerKeybindings, keybindingRows, setting, manifests } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { registerQueries } from "./lib/queries.mjs";
import { MANIFEST } from "./api-manifest.mjs";
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

async function onReady() {
  // Published one tick after ready (the publish timing is a declared step of the migration). The
  // importer merges into game.pentaryn and nothing freezes it since its keystone (items-journal-1),
  // so the old frozen-root guard is gone (kit 1.0.2, J10): the API is assigned into the plain root.
  setTimeout(() => {
    const api = {
      gather, list, crops, show,
      replace, replaceMany,
      open: ctx.exposed.open,
      place: ctx.exposed.place,
      ensureMarkers,
      model: sceneId => {
        const scene = sceneId ? game.scenes.get(sceneId) : canvas?.scene;
        if (!scene) throw codedError("SCENE_UNKNOWN", String(sceneId));
        return sceneModel(scene);
      },
      manifests,
      // `version` is the code that is running (geometry-core's VERSION); `listed` is what game.modules
      // says, which can lag behind until the world rescans module.json
      status: () => ({
        version: VERSION, listed: game.modules.get(MODULE)?.version ?? null,
        npcBridge: typeof CONFIG.queries?.["foundry-mcp-bridge.createNpcActor"] === "function",
        // the world's party for encounter budgets; blank = none, and a gather says so (never guess one)
        party: setting("party", "none set") || "none set",
        specDir: `${SPEC_DIR}/ (under the Foundry Data dir; replaceMany({specFile: "${SPEC_DIR}/<name>.json"}))`,
        doubleClick: ctx.exposed.doubleClick(), markers: SIZE_KEYS.map(k => [k, markerActor(k)?.id ?? null])
      }),
      version: VERSION
    };
    ctx.api = api;
    game.pentaryn ??= {};
    game.pentaryn.prompts = api;
  }, 0);
  try { await ensureMarkers(); } catch (err) { log.error("ensureMarkers failed", err); }
}

reg.once("init", onInit, { guard: false, label: "init: settings, keybindings, queries" });
install();
reg.once("ready", onReady, { guard: false, label: "ready: publish, ensure markers" });
