/**
 * Pentaryn AoE (pentaryn-aoe) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Spell areas you can drag and delete, monster saves rolled off the area, damage applied with a GM
 * confirm, and damage rolled automatically on a hit. Features, in load order (FEATURES):
 *   areas.mjs    Part A  ownership, handle tokens, delete cascade, Remove all templates, cleanup, sweep
 *   resolve.mjs  Part B  who is inside, NPC saves, the players' request card, Apply, Careful Spell
 *   tray.mjs     Part B  the GM-only tray on the damage message (resolve's actions via ctx.exposed)
 *   attacks.mjs  Part C  auto damage on hit
 *   effects.mjs  Part D  a spell's effects go on you when you are its only target; unapplied trays light up
 *   refund.mjs   Part F  a cancelled placement gives back the slot / charge it spent
 *   aim.mjs      Part G  a Self cone or line starts at its caster and points at the mouse
 *   escape.mjs   Part E  Escape cancels a spell-area placement on the first press, even with a sheet open
 * and core.mjs (pure), settings.mjs (SETTINGS), scene-adapter.mjs / messages-adapter.mjs / argon.mjs
 * (Foundry, dnd5e, Item Piles and Argon → plain data), lib/ (the vendored kit).
 *
 * Lifecycle: init → settings and the Escape keybinding (a keybinding can only be registered then) ·
 * setup → each feature's install(reg, ctx), in FEATURES order (aoe has always registered its hooks
 * at setup) · ready → the namespace, the Argon guard, the GM's startup work.
 *
 * Hot patch (README-documented): game.pentaryn.aoe.uninstall() removes every hook it added; then
 * set globalThis.__pentarynAoeHot, import this file under a new URL and call its install().
 *
 * Design: context/plans/aoe-circles.md · Use: README.md
 */

import { HOOKS, MODULE, VERSION } from "./core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { registerSettings, migrateSettings, setting } from "./settings.mjs";
import { areasFor, spellAreas, handleFor, removeArea } from "./scene-adapter.mjs";
import { cardEffects } from "./messages-adapter.mjs";
import { guardArgonBind } from "./argon.mjs";
import * as areas from "./areas.mjs";
import * as resolvePart from "./resolve.mjs";
import * as tray from "./tray.mjs";
import * as attacks from "./attacks.mjs";
import * as effects from "./effects.mjs";
import * as refund from "./refund.mjs";
import * as aim from "./aim.mjs";
import * as escape from "./escape.mjs";

/** Features in load order: their hooks register in this order, and order within a hook name is behaviour. */
const FEATURES = [areas, resolvePart, tray, attacks, effects, refund, aim, escape];

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

/** Remove every hook and feature state (hot patch: then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
  installed = false;
}

/** The registered hooks as `[{ name, id }]`, in registration order (the legacy shape). */
function hookIds() {
  return reg.ids().map(({ name, id }) => ({ name, id }));
}

const api = {
  areasFor, spellAreas, handleFor, removeArea,
  sweep: areas.sweep, ensureHandleActor: areas.ensureHandleActor, createHandle: areas.createHandle,
  resolve: resolvePart.resolve, applyRows: resolvePart.applyRows, rollNpcSaves: resolvePart.rollNpcSaves,
  rollForPlayer: resolvePart.rollForPlayer, pingPlayers: resolvePart.pingPlayers, setRow: resolvePart.setRow,
  selfApply: effects.selfApply, pendingFor: effects.pendingFor, cardEffects,
  activePlacement: escape.activePlacement, setting, hookIds, uninstall,
};

// pentaryn-importer creates and FREEZES game.pentaryn, so a bare assignment throws in strict
// mode. Rebuild the namespace instead (same pattern as pentaryn-transform).
function publish() {
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, aoe: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.aoe = api;
  }
}

/**
 * @param {{sweepOnReady?: boolean}} [opts]  sweepOnReady false skips the startup sweep — used when
 *        hot-patching, so the scene someone is working on is not touched.
 */
export async function install({ sweepOnReady = true } = {}) {
  registerSettings();
  escape.registerEscape();
  installHooks();
  publish();
  guardArgonBind();
  await migrateSettings();
  await areas.readyAreas({ sweepOnReady });
  return api;
}

export { api, uninstall, MODULE };

// Normal module load: settings and the Escape keybinding at init (a keybinding can only be
// registered then), hooks at setup (they only act on later events), namespace and the GM's
// startup work at ready. CONFIG.DND5E.requests exists from dnd5e's init.
if (!globalThis.__pentarynAoeHot) {
  Hooks.once("init", () => {
    registerSettings();
    escape.registerEscape();
  });
  Hooks.once("setup", () => installHooks());
  Hooks.once("ready", () => {
    // Deferred a tick: pentaryn-importer's ready hook (it sorts after "aoe") replaces
    // game.pentaryn with a frozen object, which would drop a key published synchronously here.
    setTimeout(publish, 0);
    // Argon makes ui.ARGON in its own ready hook; a tick later it exists whatever the load order.
    setTimeout(() => { if (!guardArgonBind()) Hooks.once("canvasReady", guardArgonBind); }, 0);
    migrateSettings().catch(err => console.error(`${MODULE} | settings migration`, err));
    areas.readyAreas().catch(err => console.error(`${MODULE} | ready`, err));
  });
}
