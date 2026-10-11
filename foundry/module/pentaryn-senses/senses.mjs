/**
 * Pentaryn Senses (pentaryn-senses) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Lights carried by items, the Light cantrip, the broken glow, token chains, and the one-shot reset
 * of the darkvision sight our retired 0.3 sync stored (token vision from the sheet's senses is
 * dnd5e's own since 6.0: setting senseVisionSync, TokenDocument5e#_applySenseVision).
 *
 * Files, in load order:
 *   senses-core.mjs   PURE barrel: MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS, FLAGS; re-exports
 *     core/ids.mjs      the module id and every flag path
 *     core/util.mjs     esc, unsetPath
 *     core/chain.mjs    chain flag reading, pairs, geometry
 *     core/light.mjs    light profiles, the carried-light rule, the Light cantrip's plan
 *     core/migrate.mjs  the darkvision reset plan
 *     core/glow.mjs     the broken glow's wave maths
 *   settings.mjs      SETTINGS (the sightReset store row) and the setting readers
 *   glow.mjs          feature: the "Broken glow (wandering)" light animation, added at init
 *   chain.mjs         feature: token chains (drawing, Token HUD, link/break)
 *   light.mjs         feature: the Light cantrip and lit torches, lamps and lanterns
 *   carried.mjs       feature: lights carried by items
 *   migrate.mjs       feature: the one-shot darkvision sight reset
 *   lib/*.mjs         vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: every feature installs synchronously in this body, so this module's hooks keep their
 * place against other modules' (the dnd5e.preUseActivity veto order) · init → settings · ready →
 * publish, then, on the writer's client only, the reset → the carried-light sync → the Light sweep.
 */

import { MODULE, HOOKS, VERSION } from "./senses-core.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { isActiveGM, isActiveGMOrLoneGM } from "./lib/election.mjs";
import * as glow from "./glow.mjs";
import * as chain from "./chain.mjs";
import * as light from "./light.mjs";
import * as carried from "./carried.mjs";
import * as migrate from "./migrate.mjs";

/** Features in load order (the hook registration order is pinned by test/golden/hooks.json). */
const FEATURES = [glow, chain, light, carried, migrate];

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

function onInit() {
  registerSettings();
}

/** Assign `game.pentaryn[key]`, rebuilding a frozen root (the hand-written guard step 7 retires). */
function publishInto(key, api) {
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, [key]: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn[key] = api;
  }
}

function onReady() {
  const ex = ctx.exposed;
  const api = {
    syncLight: ex.syncLight, carriedLight: ex.carriedLight, resetSight: ex.resetSight,
    light: ex.lightApi, setupLight: ex.lightApi.setup, syncAll: ex.syncAll,
  };
  publishInto("senses", api);
  try {
    publishInto("chain", ex.chainApi);
  } catch (e) {
    log.warn("chain publish", e);
  }
  if (isActiveGMOrLoneGM()) ex.resetSight()
    .catch(e => log.warn("sight reset", e))
    .then(() => ex.syncAll())
    .then(() => (isActiveGM() ? ex.lightApi.sweep() : null))
    .catch(e => log.warn("ready sweep", e));
}

install();
if (globalThis.game?.ready) {
  // A hot re-import of this entry after the world is ready (after `uninstall()`): the lifecycle
  // hooks have already fired, so run the phases now, in order. Rows already registered are skipped.
  onInit();
  onReady();
} else {
  Hooks.once("init", () => onInit());
  Hooks.once("ready", () => onReady());
}
