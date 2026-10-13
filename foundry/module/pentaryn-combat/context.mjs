/**
 * The wiring both entries share (combat.mjs = esmodules[0], hud.mjs = esmodules[1]; D11 keeps two):
 * one log, one hook registry, one ctx. A feature gets `(reg, ctx)` in `install`; `ctx.uninstall()`
 * (the API's `uninstall()`) runs every installed feature's `uninstall` in reverse and then removes
 * every hook the registry recorded. One feature's throwing `uninstall` is a warning naming it, never
 * an abort: the rest still uninstall and the hooks still come off (combat-core-ROB-4). Glue: the two
 * entries import ctx and reg; a feature file imports only the two helpers below (tempHooks, opts —
 * final review M7; each edge in test/graph-allow.json).
 *
 * ctx: log, reg, setting, emit (core HOOKS rows), api, contributions, exposed, expose(), uninstall.
 */

import { HOOKS, MODULE, VERSION } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { setting } from "./settings.mjs";

export const log = makeLog(MODULE);
export const reg = hookRegistry(MODULE, log);

const installed = [];

/** A hook's guard options: a throw is logged with the label; return values pass through (S11, D-c1). */
export const opts = label => ({ label });

/**
 * Temporary hooks (one roll, one pick, one dialog) go through the registry the feature was
 * installed with — `getReg()`, null before install and after uninstall — so uninstall() unwinds a
 * stray one; without a registry they fall back to Foundry's Hooks.
 */
export function tempHooks(getReg) {
  return {
    on: (name, fn, label) => { const hooks = getReg(); return hooks ? hooks.on(name, fn, { label }) : Hooks.on(name, fn); },
    off: (name, id) => { const hooks = getReg(); return hooks ? hooks.off(id) : Hooks.off(name, id); },
  };
}

export const ctx = {
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

/**
 * Install one feature now; its contribution (API rows + impl), if any, is kept for buildApi.
 * `name` is what the uninstall warning calls it.
 */
export function installFeature(feature, name = "feature") {
  const contribution = feature.install(reg, ctx);
  installed.push({ feature, name });
  if (contribution) ctx.contributions.push(contribution);
  return contribution;
}

/**
 * Every installed feature's uninstall, newest first, then every recorded hook. A reload re-wires.
 * A throw is one warning naming the feature; the hooks and contributions are cleared regardless.
 */
function uninstall() {
  try {
    for (const { feature, name } of installed.splice(0).reverse()) {
      try {
        feature.uninstall?.();
      } catch (err) {
        log.warn(`uninstall failed: ${name}`, err);
      }
    }
  } finally {
    reg.offAll();
    ctx.contributions.length = 0; // a hot re-import contributes them again (combat.mjs)
  }
}
