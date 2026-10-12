/**
 * Small Argon (Combat HUD) tidy-ups found on the sorcerer's HUD.
 * ==============================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(). Argon is read only through argon.mjs (the adapter); the
 * per-button wraps of parts 3 and 4 and the enrichHTML wrap are in patches.mjs. Nothing in Argon's
 * files is edited. Registered in foundry/adjustments.yml (argon-shared-uses-badge,
 * argon-collapse-on-area-placement, riders-argon-metamagic-no-picker,
 * riders-argon-tooltip-item-rolldata); the tooltip CSS is in styles/riders.css (argon-tooltip-click-through).
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
 *    `dnd5e.preSummon` does the same before a summon's placement (Area 6 re-run).
 *
 * 3. No target picker on Metamagic (usability Area 5 re-run, S4). Careful Spell's activity says
 *    "5 creatures", so Argon opened its Target Picker at "1/5 Targets"; it only finished at 5
 *    targets or after a hidden "-" key, and the targets fed nothing. pentaryn-aoe now picks the
 *    protected creatures in the area tray. A Metamagic button's `targets` reads null (per instance),
 *    so the click goes straight to dnd5e (`skipsTargetPicker`, table-core's METAMAGIC).
 *
 * 4. Spell tooltips compute with the spell's own numbers (S5). Argon enriches the description with
 *    `relativeTo: item` and no roll data, so Scorching Ray's `[[@item.level + 1]]{Total Rays}`
 *    read "1" instead of 3. While one of Argon's buttons builds its tooltip, an enrichHTML call for
 *    that item gets `rollData: item.getRollData()`, as dnd5e's own sheet passes. Row
 *    riders-argon-tooltip-item-rolldata.
 */

import { collapseAllPanels, refreshSharedUses } from "./argon.mjs";

let log = null;
let wrapButton = null;

/* ── 1. shared-uses badges ───────────────────────────────────────────────── */

function sharedUsesBadges(item, changes) {
  try { refreshSharedUses(item, changes); } catch (err) { log.warn("Argon shared-uses badge refresh skipped", err); }
}

/* ── 2. collapse before an area or a summon's placement ─────────────────── */

function collapse() {
  try { collapseAllPanels(); } catch (err) { log.warn("Argon panel collapse skipped", err); }
}

/* ── 3 + 4: per-button wraps (patches.mjs), made when Argon renders a button ── */

function tidyButton(button) {
  try {
    // Only Argon dnd5e's own item buttons (they have an activity); our own buttons subclass them too
    // and inherit the wrap, which is harmless (they are never Metamagic and enrich nothing).
    if (button?.item?.documentName === "Item") wrapButton?.(button);
  } catch (err) { log.warn("Argon button tidy skipped", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  wrapButton = button => ctx.exposed.wrapItemButton?.(button);
  reg.on("updateItem", sharedUsesBadges, { guard: false, label: "Argon shared-uses badges" });
  // Also before a summon's placement (Mage Hand, Summon Undead): the same click problem (usability
  // Area 6 re-run, W8/W10).
  reg.on("dnd5e.preCreateMeasuredTemplate", collapse, { guard: false, label: "Argon panel collapse" });
  reg.on("dnd5e.preSummon", collapse, { guard: false, label: "Argon panel collapse" });
  reg.on("renderItemButtonArgonComponent", tidyButton, { guard: false, label: "Argon button tidy" });
}

/** Nothing to clear here: the tooltip-item marks and the wraps are patches.mjs's (removePatches). */
export function uninstall() {}
