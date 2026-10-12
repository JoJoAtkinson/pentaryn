/**
 * Pentaryn AoE (pentaryn-aoe) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Features, in load order (FEATURES; the file map is in README.md "Files"):
 *   areas.mjs    Part A  ownership, handle tokens, delete cascade, Remove all templates, cleanup, sweep
 *   careful.mjs  Part B  Careful Spell: the caster's side in the next save spell's area is protected
 *   resolve.mjs  Part B  who is inside, NPC saves, the players' request card, Apply
 *   tray.mjs     Part B  the GM-only tray on the damage message (resolve's actions via ctx.exposed)
 *   attacks.mjs  Part C  auto damage on hit
 *   effects.mjs  Part D  a spell's effects go on you when you are its only target; unapplied trays light up
 *   refund.mjs   Part F  a cancelled placement gives back the slot / charge it spent
 *   aim.mjs      Part G  a Self cone or line starts at its caster and points at the mouse
 *   escape.mjs   Part E  Escape cancels a spell-area placement on the first press, even with a sheet open
 *
 * Lifecycle: init → settings and the Escape keybinding (a keybinding can only be registered then) ·
 * setup → each feature's install(reg, ctx), in FEATURES order (aoe has always registered its hooks
 * at setup) · ready → buildApiFor(ctx), publishNamespace, the Argon guard, the GM's startup work.
 *
 * Hot patch (README-documented): game.pentaryn.aoe.uninstall() removes every hook and patch it
 * added; then set globalThis.__pentarynAoeHot, import this file under a new URL and call its
 * install(). With the README's procedure (every file fetched and its relative imports rewritten
 * to blob URLs) every file is a fresh copy, so changed code runs without a reload. Importing
 * only this file under a new URL (as glue.test does) re-runs the WIRING with the feature, core,
 * api and settings instances already loaded, and a code change then needs a reload.
 */

import { HOOKS, MODULE, NS, VERSION } from "./core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerSettings, migrateSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import { guardArgonBind, unguardArgonBind } from "./argon.mjs";
import * as areas from "./areas.mjs";
import * as careful from "./careful.mjs";
import * as resolvePart from "./resolve.mjs";
import * as tray from "./tray.mjs";
import * as attacks from "./attacks.mjs";
import * as effects from "./effects.mjs";
import * as refund from "./refund.mjs";
import * as aim from "./aim.mjs";
import * as escape from "./escape.mjs";

/** Features in load order: their hooks register in this order, and order within a hook name is behaviour. */
const FEATURES = [areas, careful, resolvePart, tray, attacks, effects, refund, aim, escape];

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

let installed = false;

function installHooks() {
  if (installed) return;
  installed = true;
  ctx.contributions.length = 0;
  for (const feature of FEATURES) {
    const contribution = feature.install(reg, ctx);
    if (contribution) ctx.contributions.push(contribution);
  }
}

/** Remove every hook, patch and feature state (hot patch: then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  unguardArgonBind();   // [declared] D-A2 (-15): Argon gets its own bind back
  reg.offAll();
  installed = false;
}

/**
 * The published API (kit-built, frozen; null until ready or after a manifest drift). A hot patch's
 * install() republishes a new object; this binding follows it.
 */
export let api = null;

function onInit() {
  registerSettings();
  escape.registerEscape();
}

function onSetup() {
  installHooks();
}

/**
 * ready, in today's order: the API (built first: a manifest drift stops the publish with one clear
 * line, the startup work still runs), published synchronously ([declared] D-A3: it used to wait a
 * tick for pentaryn-importer's frozen root, which the importer no longer makes); the Argon guard a
 * tick later (Argon makes ui.ARGON in its own ready hook); then the active GM's startup work.
 * `hot`: the hot-patch install() runs the Argon guard and the startup work itself.
 */
function onReady({ hot = false } = {}) {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    ctx.api = null;
    log.error("API manifest drift — not published", err);
  }
  if (ctx.api) publishNamespace(NS, ctx.api, { moduleId: MODULE });
  api = ctx.api;
  if (hot) return;
  // D-A4: the late-Argon fallback goes through the registry too, so uninstall() removes it.
  setTimeout(() => { if (!guardArgonBind()) reg.once("canvasReady", () => guardArgonBind(), { label: "canvasReady(argon)" }); }, 0);
  migrateSettings().catch(err => log.error("settings migration", err));
  areas.readyAreas().catch(err => log.error("ready", err));
}

/**
 * Hot patch (README): after game.pentaryn.aoe.uninstall(), a copy imported with
 * globalThis.__pentarynAoeHot set re-wires here. Settings and the keybinding already registered
 * are skipped (a hot copy cannot add a keybinding; it takes over the Escape slot).
 * @param {{sweepOnReady?: boolean}} [opts]  sweepOnReady false skips the startup sweep, so the scene
 *        someone is working on is not touched.
 * @returns {Promise<object|null>} the published API
 */
export async function install({ sweepOnReady = true } = {}) {
  onInit();
  onSetup();
  onReady({ hot: true });
  guardArgonBind();
  await migrateSettings();
  await areas.readyAreas({ sweepOnReady });
  return ctx.api;
}

export { uninstall, MODULE };

// Normal module load: settings and the Escape keybinding at init (a keybinding can only be
// registered then), hooks at setup (they only act on later events), the API and the GM's startup
// work at ready. CONFIG.DND5E.requests exists from dnd5e's init.
if (!globalThis.__pentarynAoeHot) {
  Hooks.once("init", onInit);
  Hooks.once("setup", onSetup);
  Hooks.once("ready", onReady);
}
