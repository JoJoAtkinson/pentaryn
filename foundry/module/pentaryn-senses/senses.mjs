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
 *   api-manifest.mjs  PURE API rows (describe() reads them)
 *   api.mjs           the rows bound to what the features exposed; buildApiFor(ctx)
 *   glow.mjs          feature: the "Broken glow (wandering)" light animation, added at init
 *   chain.mjs         feature: token chains (drawing, Token HUD, link/break)
 *   light.mjs         feature: the Light cantrip and lit torches, lamps and lanterns
 *   carried.mjs       feature: lights carried by items
 *   migrate.mjs       feature: the one-shot darkvision sight reset
 *   lib/*.mjs         vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: every feature installs synchronously in this body, so this module's hooks keep their
 * place against other modules' (the dnd5e.preUseActivity veto order) · init → settings · ready →
 * build the API, publish senses and the chain alias, then, on the writer's client only, the reset →
 * the carried-light sync → the Light sweep.
 *
 * Hot patch: `game.pentaryn.senses.uninstall()`, then `await import("/modules/pentaryn-senses/senses.mjs?v=2")`.
 * Only this entry's URL changes, so the re-run registers the SAME handlers again and republishes the
 * same code as a new API object; any edit to another file needs a reload.
 */

import { MODULE, NS, HOOKS, VERSION } from "./senses-core.mjs";
import { registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
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

/**
 * Build the API first (a drift throw stops here with one clear line), publish it as
 * game.pentaryn.senses and module.api, then the chain alias (game.pentaryn.chain, the same frozen
 * object as senses.chain), then — on the writer's client only — the reset → the carried-light sync
 * → the Light sweep. A frozen game.pentaryn throws in publishNamespace (kit 1.0.2, J10).
 */
function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  publishNamespace("chain", ctx.api.chain, { moduleId: MODULE, alias: true });
  const ex = ctx.exposed;
  if (isActiveGMOrLoneGM()) ex.resetSight()
    .catch(e => log.warn("sight reset", e))
    .then(() => ex.syncAll())
    .then(() => (isActiveGM() ? ex.light.sweep() : null))
    .catch(e => log.warn("ready sweep", e));
}

install();
if (globalThis.game?.ready) {
  // A hot re-import of this entry after the world is ready (after `uninstall()`): the lifecycle
  // hooks have already fired, so run the phases now, in order. Rows already registered are skipped.
  onInit();
  onReady();
} else {
  Hooks.once("init", onInit);
  Hooks.once("ready", onReady);
}
