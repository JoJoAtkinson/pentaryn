/**
 * Argon Combat HUD adapter: Foundry/Argon → plain calls for the features. The shared helpers come
 * from the vendored kit (lib/argon-kit.mjs: dropTooltip, paintBadge, applyButtons,
 * itemButtonClass, mainPanel, settlePips); this file adds combat's own. An adapter imports only
 * core and lib, so a setting a helper depends on is passed in by the caller.
 */

import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { mainPanel, settlePips } from "./lib/argon-kit.mjs";

const log = makeLog(MODULE);

export { mainPanel, settlePips };

/**
 * Re-render the HUD after a setting changed. Only a bound HUD: with no actor Argon's panels throw
 * "reading 'system' of null". A throwing render (the HUD closed meanwhile) is swallowed at debug.
 */
export function renderHud() {
  try {
    if (ui.ARGON?._actor) ui.ARGON.render();
  } catch (err) {
    log.debug("HUD re-render (HUD closed)", err);
  }
}

/** Release this user's targets (a pick that is then cancelled restores them; a turn end leaves them gone). */
export function releaseTargets() {
  if (!game.user.targets.size) return;
  if (canvas.tokens?.setTargets) canvas.tokens.setTargets([], { mode: "replace" });
  else for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false });
}

/** Argon's hover tooltip for a button inside a drawer that just closed stayed on screen (Area 4, D5). */
export function dropDrawerTooltip(panel) {
  try {
    const t = ui.ARGON?._tooltip;
    const trigger = t?._triggerElement;
    if (!t || !trigger || !panel?.element?.contains?.(trigger)) return;
    game.tooltip?.deactivate?.();
    t._destroy?.(true);
    if (ui.ARGON._tooltip === t) ui.ARGON._tooltip = null;
  } catch (err) { log.debug("drawer tooltip", err); }   // never let tooltip hygiene break a click
}

/**
 * A turn boundary closes the drawers (Cast Spell, Use Feature…) left open on the HUD of the creature
 * whose turn ended or began, and forgets that they were open: Argon restores a drawer from its saved
 * panel state on every render, so the Paladin's Bonus-bar Cast Spell drawer from F1 was open again at
 * the start of the next turn (Area 3 re-run). `enabled` is setting drawerNearButton.
 */
export function closeDrawersOf(actors, { enabled = true } = {}) {
  try {
    if (!enabled) return;
    const hud = ui.ARGON;
    const states = hud?._hudState;
    let shown = false;
    for (const actor of actors) {
      if (!actor) continue;
      const state = states?.get?.(actor);
      if (state && typeof state === "object") {
        for (const v of Object.values(state)) if (v && typeof v === "object" && "visible" in v) v.visible = false;
      }
      if (hud?._actor === actor) shown = true;
    }
    if (shown) hud.collapseAllPanels?.();
  } catch (err) { log.debug("close drawers", err); }   // never break a turn change
}
