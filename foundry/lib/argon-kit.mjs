// pentaryn kit 1.0.2 · vendored from foundry/lib/argon-kit.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * The Argon Combat HUD helpers that pentaryn-combat and pentaryn-transform each hand-copied
 * (transform-creatures-12, combat-riders-3/-5, -18 phase 1; audit Wave 8.6, decision D7).
 *
 * Argon has no "add a button" API. Every panel fires `render<ParentClass>ArgonComponent` after it
 * renders, its button list is a plain array (`panel._buttons`) and each button is a plain element,
 * so a module recomposes a bar inside that hook. These helpers are the shared parts of that idiom.
 * Nothing here registers a hook, reads a setting or touches a module's own state; every Foundry or
 * Argon global is read through the injected `g` (default `globalThis`), so node tests drive them
 * with a plain object.
 *
 * `applyButtons` is combat's superset: `attachDetached` (combat's U-3-7 branch) and `after` (combat's
 * `placeOpenDrawers`) are opt-in, so transform's call keeps its own behaviour until a live test
 * proves the branch is a no-op on its panels.
 *
 * `itemButtonClass` caches the class per copy of this file: each module vendors its own copy, so
 * each module keeps its own cache, as each hand copy did.
 */

let itemButton = null;   // Argon dnd5e's closure-private ItemButton subclass, borrowed from a weapon-set slot

/** Close core's tooltip and forget Argon's hover tooltip. Never throws (tooltip hygiene must not break a click). */
export function dropTooltip({ g = globalThis, log = null } = {}) {
  try {
    g.game?.tooltip?.deactivate?.();
    if (g.ui?.ARGON?._tooltip) g.ui.ARGON._tooltip = null;
  } catch (err) {
    log?.debug?.("drop tooltip", err);
  }
}

/**
 * The uses badge, as Argon's ItemButton `.quantity-1` markup (Argon's has-count class draws
 * nothing). `left` null/undefined removes it; `left === 0` adds `emptyClass` (the module's own).
 */
export function paintBadge(button, left, emptyClass, { g = globalThis } = {}) {
  let badge = button.element.querySelector(":scope > .quantity-1");
  if (left === null || left === undefined) badge?.remove();
  else {
    if (!badge) {
      badge = g.document.createElement("div");
      badge.className = "quantity-1";
      badge.innerHTML = `<div class="border-triangle"></div><span></span>`;
      button.element.prepend(badge);
    }
    badge.querySelector("span").textContent = String(left);
  }
  if (emptyClass) button.element.classList.toggle(emptyClass, left === 0);
}

/**
 * Replace a panel's buttons with `next`, in order, rendering only `fresh` (the new ones).
 *  - `attachDetached`: Argon never attaches a panel that had no buttons when the HUD was built (a
 *    Rogue's Special bar), so buttons added to it sat in a detached element. With this on, a
 *    detached panel that now has buttons is inserted before the next attached main panel (combat
 *    U-3-7).
 *  - `after(panel)`: called last (combat re-places open drawers whose buttons moved).
 */
export function applyButtons(panel, next, fresh = [], { attachDetached = false, after = null, g = globalThis } = {}) {
  for (const old of panel._buttons) if (!next.includes(old)) old.element.remove();
  for (const b of next) {
    b._parent = panel;
    panel.element.appendChild(b.element);
  }
  panel._buttons = next;
  for (const b of fresh) b.render();
  if (attachDetached && next.length && !panel.element.isConnected) {
    const main = g.ui?.ARGON?.components?.main ?? [];
    const following = main.slice(main.indexOf(panel) + 1).find(p => p?.element?.isConnected);
    const before = following?.element ?? main.findLast?.(p => p?.element?.isConnected)?.element?.nextSibling ?? null;
    const host = following?.element.parentElement ?? main.find(p => p?.element?.isConnected)?.element.parentElement;
    if (host) host.insertBefore(panel.element, before);
  }
  panel.updateVisibility();
  if (after) after(panel);
}

/**
 * Argon dnd5e's own ItemButton subclass (closure-private in its module), learned from a panel's
 * weapon-set slot the first time one is seen. With no panel: the cached class, or null.
 */
export function itemButtonClass(panel = null, { g = globalThis } = {}) {
  if (itemButton || !panel) return itemButton;
  const base = g.CONFIG?.ARGON?.MAIN?.BUTTONS?.ItemButton;
  const slot = base && panel._buttons.find(b => b instanceof base && b._isWeaponSet);
  if (slot) itemButton = slot.constructor;
  return itemButton;
}

/** What one bar button is, for a composition golden: weaponSet, item (with its id), split, other. */
export function slotKind(button, { ItemButton, SplitButton } = {}) {
  if (button?._isWeaponSet) return { kind: "weaponSet" };
  if (ItemButton && button instanceof ItemButton) return { kind: "item", id: button.item?.id ?? null };
  if (SplitButton && button instanceof SplitButton) return { kind: "split", ids: [button.button1?.item?.id, button.button2?.item?.id] };
  return { kind: "other" };
}

/** One of the HUD's main panels by its label ("DND5E.Action", "DND5E.BonusAction", …), else null. */
export function mainPanel(label, { g = globalThis } = {}) {
  return g.ui?.ARGON?.components?.main?.find?.(p => p.label === label) ?? null;
}

/**
 * Argon's ActionPanel#updateActionUse paints used pips only when the pip count did not change, so
 * a panel whose count just changed needs a second call: twice always settles it.
 */
export function settlePips(panel) {
  panel?.updateActionUse?.();
  panel?.updateActionUse?.();
}
