/**
 * Pentaryn Transform — the wiring both entries share (transform.mjs = esmodules[0], hud.mjs =
 * esmodules[1]; D11 keeps two until the Wave 8 collapse): one log, one hook registry, one ctx. The ES
 * module cache makes this one instance. GLUE: only the two entries import this file.
 *
 * A feature gets `(reg, ctx)` in `install`; `ctx.uninstall()` (the API's uninstall()) runs every
 * installed feature's `uninstall` newest first (one that throws is logged by name and skipped), then
 * removes every hook the registry recorded and undoes the patch. ctx: log, reg, setting, emit (core
 * HOOKS rows — none), api, contributions, exposed, expose(), uninstall.
 */

import { HOOKS, MODULE, VERSION } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { emitter, hookRegistry } from "./lib/hooks.mjs";
import { setting } from "./settings.mjs";
import { removePatches } from "./patches.mjs";

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
export function installFeature(feature, name = "feature") {
  const contribution = feature.install(reg, ctx);
  installed.push({ feature, name });
  if (contribution) ctx.contributions.push(contribution);
  return contribution;
}

/** Every installed feature's uninstall, newest first (a throw is logged and skipped, R3), then every
 *  recorded hook, then the patch. */
function uninstall() {
  for (const { feature, name } of installed.splice(0).reverse()) {
    try { feature.uninstall?.(); } catch (err) { log.warn(`${name}: uninstall failed`, err); }
  }
  ctx.contributions.length = 0;
  reg.offAll();
  removePatches();
}
