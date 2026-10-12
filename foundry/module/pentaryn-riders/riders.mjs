/**
 * Pentaryn Feature Riders (pentaryn-riders) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Files, in load order (features install in FEATURES order, which is the order every shared hook
 * runs its listeners: dnd5e.preUseActivity = rituals' slot untick, cast-flow's restore-slot default
 * and stale-target drop, then the Battle Medic veto; dnd5e.renderChatMessage = the break label and
 * the concentration line before the card note; dnd5e.postUseActivity = Arcane Recovery before
 * Battle Medic — test/golden/hooks.json pins it):
 *   riders-core.mjs        PURE: constants, the RULES table and the rider planning
 *   rituals-core.mjs       PURE: Ritual Adept and Longer casts filters
 *   table-core.mjs         PURE: concentration, Argon and cast-flow helpers
 *   settings.mjs           SETTINGS table, settingOr / settingRaw readers
 *   shapes.mjs             ADAPTER: dnd5e documents → the cores' shapes; Hit Dice reads and writes
 *   argon.mjs              ADAPTER: the only reader of ui.ARGON / CONFIG.ARGON
 *   patches.mjs            every wrap of another package's code (wrapMethod + adjustments row)
 *   api-manifest.mjs       PURE: the API rows (describe() reads them)
 *   api.mjs                implementations, inspect(), selftest(), buildApiFor(ctx)
 *   rituals.mjs … hd-sheet.mjs   the features: install(reg, ctx) / uninstall()
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the features install synchronously when this file loads (as their module-scope hooks
 * did before; moving them to `setup` would reorder them against other modules) · init → the
 * settings and the Battle Medic relay query · ready → the patches, then the publish.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.riders.uninstall()`, then
 * `await import("/modules/pentaryn-riders/riders.mjs?v=2")`. Any edit to another file needs a reload.
 */

import { HOOKS, MODULE, VERSION } from "./riders-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { installPatches, removePatches, wrapItemButton } from "./patches.mjs";
import { buildApiFor } from "./api.mjs";
import * as rituals from "./rituals.mjs";
import * as concentration from "./concentration.mjs";
import * as argonTidy from "./argon-tidy.mjs";
import * as castFlow from "./cast-flow.mjs";
import * as damageRiders from "./damage-riders.mjs";
import * as cardNote from "./card-note.mjs";
import * as trayPreset from "./tray-preset.mjs";
import * as battleMedic from "./battle-medic.mjs";
import * as hdSheet from "./hd-sheet.mjs";

/** Features in load order (= today's module evaluation order: the four side-effect imports, then the body). */
const FEATURES = [rituals, concentration, argonTidy, castFlow, damageRiders, cardNote, trayPreset, battleMedic, hdSheet];

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
  ctx.expose({ wrapItemButton: button => wrapItemButton(button, ctx) });
  for (const feature of FEATURES) {
    const contribution = feature.install(reg, ctx);
    if (contribution) ctx.contributions.push(contribution);
  }
}

/** Remove every hook, patch and feature state (hot patch: then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  removePatches();
  reg.offAll();
}

function onInit() {
  registerSettings();
  battleMedic.registerRelay();
}

function onReady() {
  installPatches(ctx);
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  // pentaryn-importer replaced game.pentaryn with a frozen object in its own ready hook; defer a
  // tick and rebuild rather than assign (same as pentaryn-journal / -portals).
  setTimeout(() => {
    const api = ctx.api;
    const current = game.pentaryn;
    if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, riders: api };
    else { game.pentaryn ??= {}; game.pentaryn.riders = api; }
  }, 0);
}

install();
if (globalThis.game?.ready) {
  // a hot re-import after the world is ready: the lifecycle hooks have already fired
  onInit();
  onReady();
} else {
  reg.once("init", onInit, { guard: false, label: "init: settings, Battle Medic relay" });
  reg.once("ready", onReady, { guard: false, label: "ready: patches, publish" });
}
