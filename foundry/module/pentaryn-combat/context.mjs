/**
 * The wiring both entries share (combat.mjs = esmodules[0], hud.mjs = esmodules[1]; D11 keeps two):
 * one log, one hook registry, one ctx. A feature gets `(reg, ctx)` in `install`; `ctx.uninstall()`
 * (the API's `uninstall()`) runs every installed feature's `uninstall` in reverse and then removes
 * every hook the registry recorded. Glue: only the two entries import this file.
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

/** Install one feature now; its contribution (API rows + impl), if any, is kept for buildApi. */
export function installFeature(feature) {
  const contribution = feature.install(reg, ctx);
  installed.push(feature);
  if (contribution) ctx.contributions.push(contribution);
  return contribution;
}

/** Every installed feature's uninstall, newest first, then every recorded hook. A reload re-wires. */
function uninstall() {
  for (const f of installed.splice(0).reverse()) f.uninstall?.();
  reg.offAll();
}
