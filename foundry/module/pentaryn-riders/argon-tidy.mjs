/**
 * Small Argon (Combat HUD) tidy-ups found on the sorcerer's HUD.
 * ==============================================================
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
 *    `dnd5e.preSummon` does the same before a summon's placement (Area 6 re-run).
 *
 * 3. No target picker on Metamagic (usability Area 5 re-run, S4). Careful Spell's activity says
 *    "5 creatures", so Argon opened its Target Picker at "1/5 Targets"; it only finished at 5
 *    targets or after a hidden "-" key, and the targets fed nothing. pentaryn-aoe now picks the
 *    protected creatures in the area tray. A Metamagic button's `targets` reads null (per instance),
 *    so the click goes straight to dnd5e. Row argon-metamagic-no-picker.
 *
 * 4. Spell tooltips compute with the spell's own numbers (S5). Argon enriches the description with
 *    `relativeTo: item` and no roll data, so Scorching Ray's `[[@item.level + 1]]{Total Rays}`
 *    read "1" instead of 3. While one of Argon's buttons builds its tooltip, an enrichHTML call for
 *    that item gets `rollData: item.getRollData()`, as dnd5e's own sheet passes. Row
 *    argon-tooltip-item-rolldata.
 */

import { MODULE, spendsUsesOf, skipsTargetPicker } from "./table-core.mjs";

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
  } catch (err) { console.warn(`${MODULE} | Argon shared-uses badge refresh skipped`, err); }
});

// Also before a summon's placement (Mage Hand, Summon Undead): the same click problem (usability
// Area 6 re-run, W8/W10).
for (const hook of ["dnd5e.preCreateMeasuredTemplate", "dnd5e.preSummon"]) {
  Hooks.on(hook, () => {
    try { ui.ARGON?.collapseAllPanels?.(); } catch (err) { console.warn(`${MODULE} | Argon panel collapse skipped`, err); }
  });
}

/* ── 3 + 4: per-button wraps, made when Argon renders the button ───────────── */

const tooltipItems = new Set();

function wrapEnrich() {
  const TE = foundry.applications?.ux?.TextEditor?.implementation;
  if (!TE?.enrichHTML || TE.enrichHTML._prItemRollData) return;
  const own = TE.enrichHTML;
  const wrapped = function (content, options = {}) {
    try {
      const item = options?.relativeTo;
      if (item && !options.rollData && tooltipItems.has(item) && typeof item.getRollData === "function") {
        options = { ...options, rollData: item.getRollData() };
      }
    } catch { /* enrich as asked */ }
    return own.call(this, content, options);
  };
  wrapped._prItemRollData = true;
  TE.enrichHTML = wrapped;
}

Hooks.once("ready", () => { try { wrapEnrich(); } catch (err) { console.warn(`${MODULE} | tooltip roll data skipped`, err); } });

/** Wrap Argon dnd5e's (closure-private) item button class once, through the first button rendered. */
function wrapButtonClass(button) {
  const proto = Object.getPrototypeOf(button);
  if (!proto || proto._prTidy) return;
  proto._prTidy = true;
  let d = null;
  for (let p = proto; p && !d; p = Object.getPrototypeOf(p)) d = Object.getOwnPropertyDescriptor(p, "targets");
  if (d?.get) {
    const ownTargets = d.get;
    Object.defineProperty(proto, "targets", {
      configurable: true,
      get() { return skipsTargetPicker(this.item) ? null : ownTargets.call(this); }
    });
  }
  const ownTip = proto.getTooltipData;
  if (typeof ownTip === "function") {
    proto.getTooltipData = async function (...args) {
      const it = this.item;
      if (!it || it.documentName !== "Item") return ownTip.apply(this, args);
      tooltipItems.add(it);
      try { return await ownTip.apply(this, args); } finally { tooltipItems.delete(it); }
    };
  }
}

Hooks.on("renderItemButtonArgonComponent", (button) => {
  try {
    // Only Argon dnd5e's own item buttons (they have an activity); our own buttons subclass them too
    // and inherit the wrap, which is harmless (they are never Metamagic and enrich nothing).
    if (button?.item?.documentName === "Item") wrapButtonClass(button);
  } catch (err) { console.warn(`${MODULE} | Argon button tidy skipped`, err); }
});
