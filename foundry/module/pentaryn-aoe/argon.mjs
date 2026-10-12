/**
 * Argon (enhancedcombathud) — the one file that touches ui.ARGON (ADAPTER).
 *
 * Argon never binds to an area handle. Dragging a handle controls it, Argon bound its HUD to it
 * (the handle actor: a 0/0 HP skull bar) and the caster had to click their own token again
 * (Area 4, D10). The HUD now stays on whatever it showed. Argon's controlToken hook calls
 * `this.bind(token)`, so an instance wrap of `bind` covers it. Adjustment row aoe-argon-handle-bind.
 */

import { isHandleTarget } from "./core.mjs";

export function guardArgonBind() {
  const hud = ui.ARGON;
  if (!hud?.bind || hud.bind._aoeGuard) return !!hud?.bind?._aoeGuard;
  const own = hud.bind;
  const guarded = function (target, ...rest) {
    try { if (target && isHandleTarget(target)) return Promise.resolve(); } catch { /* bind as usual */ }
    return own.call(this, target, ...rest);
  };
  guarded._aoeGuard = true;
  hud.bind = guarded;
  return true;
}
