/**
 * Pentaryn Feature Riders — ADAPTER for Argon (enhancedcombathud / enhancedcombathud-dnd5e): the
 * only file that reads `ui.ARGON` or `CONFIG.ARGON`. Nothing in Argon's files is edited.
 * Rows: argon-shared-uses-badge, argon-collapse-on-area-placement, riders-argon-ritual-adept-list.
 */

import { spendsUsesOf } from "./table-core.mjs";

/**
 * Shared-uses badges: on a uses change of an item of the HUD's actor, re-render every HUD button
 * whose item spends that item's uses (`itemUses` consumption: every Metamagic option spends Font
 * of Magic). Argon re-renders a button only when the button's own item changes.
 */
export function refreshSharedUses(item, changes) {
  const hud = ui.ARGON;
  if (!hud?.rendered || !item?.parent || item.parent !== hud._actor) return;
  if (!foundry.utils.hasProperty(changes ?? {}, "system.uses")) return;
  for (const button of hud.itemButtons ?? []) {
    const own = button?.item;
    if (!own || own === item || !spendsUsesOf(own, item.id)) continue;
    button.render?.();
  }
}

/** Collapse Argon's open panels (the call Argon makes when you open another panel). No HUD → nothing. */
export function collapseAllPanels() {
  ui.ARGON?.collapseAllPanels?.();
}

/** Argon's base `ButtonPanelButton` class (the Cast Spell panel button), or null without Argon. */
export function buttonPanelButtonClass() {
  return CONFIG.ARGON?.MAIN?.BUTTONS?.ButtonPanelButton ?? null;
}
