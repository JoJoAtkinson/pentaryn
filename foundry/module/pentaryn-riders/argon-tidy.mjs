/**
 * Two small Argon (Combat HUD) tidy-ups found on the sorcerer's HUD.
 * ==================================================================
 *
 * Imported by riders.mjs. Nothing in Argon's files is edited. Registered in foundry/adjustments.yml
 * (argon-shared-uses-badge, argon-collapse-on-area-placement); the tooltip CSS is in riders.css
 * (argon-tooltip-click-through).
 *
 * 1. Shared-uses badges. A button whose activity spends ANOTHER item's uses (`itemUses`
 *    consumption: every Metamagic option spends Font of Magic) shows that item's uses as its
 *    badge. Argon re-renders a button only when the button's own item changes, and its follow-up
 *    `updateItemButtons(items)` adds only the first item to its batch (`Set#add(...items)`), so the
 *    Metamagic badges kept an old count until something else re-rendered them. On `updateItem`
 *    of the HUD actor's item, with a uses change, we re-render every HUD button whose item spends
 *    that item's uses.
 *
 * 2. Area placement with a panel open. Casting Fireball from the Cast Spell panel left the panel
 *    open over the battlefield; the click meant to place the area landed on a spell button behind
 *    it. `dnd5e.preCreateMeasuredTemplate` fires just before dnd5e starts the placement: we
 *    collapse Argon's open panels then (the same call Argon makes when you open another panel).
 */

import { MOD, spendsUsesOf } from "./table-core.mjs";

Hooks.on("updateItem", (item, changes) => {
  try {
    const hud = ui.ARGON;
    if (!hud?.rendered || !item?.parent || item.parent !== hud._actor) return;
    if (!foundry.utils.hasProperty(changes ?? {}, "system.uses")) return;
    for (const button of hud.itemButtons ?? []) {
      const own = button?.item;
      if (!own || own === item || !spendsUsesOf(own, item.id)) continue;
      button.render?.();
    }
  } catch (err) { console.warn(`${MOD} | Argon shared-uses badge refresh skipped`, err); }
});

Hooks.on("dnd5e.preCreateMeasuredTemplate", () => {
  try { ui.ARGON?.collapseAllPanels?.(); } catch (err) { console.warn(`${MOD} | Argon panel collapse skipped`, err); }
});
