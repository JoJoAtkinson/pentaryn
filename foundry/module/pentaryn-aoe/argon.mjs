/**
 * Argon (enhancedcombathud) — the one file that touches ui.ARGON (ADAPTER).
 *
 * Argon never binds to an area handle. Dragging a handle controls it, Argon bound its HUD to it
 * (the handle actor: a 0/0 HP skull bar) and the caster had to click their own token again
 * (Area 4, D10). The HUD now stays on whatever it showed. Argon's controlToken hook calls
 * `this.bind(token)`, so an instance wrap of `bind` covers it: kit wrapMethod, marker `_aoeGuard`,
 * adjustments row aoe-argon-handle-bind (describe().patches lists it).
 */

import { MODULE, isHandleTarget } from "./core.mjs";
import { makeLog } from "./lib/log.mjs";
import { wrapMethod } from "./lib/patch.mjs";

const log = makeLog(MODULE);
/** The wrap of the ui.ARGON instance guarded last (unguardArgonBind undoes it). */
let handle = null;

/** Wrap ui.ARGON.bind once; true when it is (now or already) guarded, false when Argon is not there yet. */
export function guardArgonBind() {
  const hud = ui.ARGON;
  if (!hud?.bind) return false;
  handle = wrapMethod(MODULE, {
    target: hud, name: "bind", label: "ui.ARGON#bind", marker: "_aoeGuard", adjustments: "aoe-argon-handle-bind",
  }, function (wrapped, target, ...rest) {
    try {
      if (target && isHandleTarget(target)) return Promise.resolve();
    } catch (err) {
      log.debug("argon bind check", err);   // bind as usual
    }
    return wrapped(target, ...rest);
  }, { log });
  return true;
}

/** Restore Argon's own bind (once; a later guardArgonBind wraps again). */
export function unguardArgonBind() {
  handle?.unwrap();
  handle = null;
}
