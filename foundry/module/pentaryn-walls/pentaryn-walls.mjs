/**
 * Wall autocomplete (pentaryn-walls) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Deterministic completion of hand-drawn walls: rough in the windows, doors and hint stubs, and
 * the engine infers the rest or refuses and says why. Design: context/plans/foundry-wall-autocomplete.md.
 *
 * Files, in load order:
 *   walls-core.mjs       PURE barrel: constants, HOOKS, report/undo text, the busy lock; re-exports
 *     core/engine.mjs      the engine — pure geometry, no Foundry APIs, no I/O
 *     core/backends.mjs    the backend registry ("js" registered here) and canonical()/compare()
 *   backend-wasm.mjs     adapter: loads wall-engine.wasm (fetch or node:fs) and registers "wasm"
 *   settings.mjs         SETTINGS (backend) and KEYBINDINGS (Alt+W, Alt+Z, Alt+Shift+W)
 *   actions.mjs          feature: preview / run / undo / analyze / makeMacro and the keybinding guard
 *   migrations.mjs       feature, dormant: the Wave 7 flag-scope migration (core/migrate.mjs plans it)
 *   api-manifest.mjs     PURE API rows (describe() reads them)
 *   api.mjs              the rows bound to the actions; buildApiFor(ctx)
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the feature installs synchronously in this body (it registers no hooks) · init →
 * settings and keybindings (Foundry refuses keybindings after setup) · ready → GM only, after the
 * wasm load settles: build the API (a drift throw stops there), publish, one console line.
 */

import { HOOKS, MODULE, NS, VERSION, available, readyLine } from "./walls-core.mjs";
import { loadErrorMessage, ready as wasmReady } from "./backend-wasm.mjs";  // registers "wasm"; loads async
import { registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { isAnyGM } from "./lib/election.mjs";
import * as actions from "./actions.mjs";
import * as migrations from "./migrations.mjs";

/** Features in load order. `migrations` is dormant: nothing calls it until the Wave 7 batch. */
const FEATURES = [actions, migrations];

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

/** Remove every hook and feature state. */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

// Keybindings MUST be registered during `init` — ClientKeybindings#register throws
// afterwards (client/helpers/interaction/client-keybindings.mjs:156).
function onInit() {
  registerSettings({ log, onKey: action => ctx.exposed.keybindingGuard(ctx.exposed[action]) });
}

/**
 * GM only, after the wasm load settles (it has by now in practice; awaited so the log line is
 * accurate). `game.pentaryn` is assigned into, never rebuilt (kit 1.0.2, J10): a frozen root
 * throws in publishNamespace and the hook stops before its log line.
 */
async function onReady() {
  if (!isAnyGM()) return;
  await wasmReady;
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE, when: "ready:gm:wasm" });
  console.log(`${MODULE} | ${readyLine(available().map(b => b.name), loadErrorMessage())}`);
}

install();
Hooks.once("init", onInit);
Hooks.once("ready", onReady);
