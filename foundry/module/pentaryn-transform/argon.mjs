/**
 * Pentaryn Transform — ADAPTER: the only reads and writes of Argon's private state (ui.ARGON._*,
 * panel._buttons, Argon's target picker) and of the tooltip manager. Rows argon-panel-injection,
 * argon-target-picker-cancel, argon-tooltip-clear (foundry/adjustments.yml).
 */

import { MODULE } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

let DND5eItemButton = null;      // borrowed from the weapon-set slot, once seen

/* ── tooltips ────────────────────────────────────────────────────────────── */
// Argon shows its tooltips through Foundry's TooltipManager, anchored to the hovered button. Every
// shift and revert rebuilds the HUD, so that button leaves the DOM without a pointerleave and the
// tooltip stayed on screen until the mouse found another tooltipped element. Any tooltip whose
// anchor is gone is dropped: after each HUD render, and on the next pointer move.

export function dropTooltip() {
  try {
    game.tooltip?.deactivate?.();
    if (ui.ARGON?._tooltip) ui.ARGON._tooltip = null;
  } catch (err) { log.debug("tooltip hygiene", err); }   // never let tooltip hygiene break a click
}

export function dropStaleTooltip() {
  const anchor = game.tooltip?.element;
  if (anchor && !anchor.isConnected) dropTooltip();
}

let staleCheckQueued = false;

/** The capture-phase pointermove listener (hud.mjs installs it): one stale-tooltip check per 60 ms. */
export function onPointerMove() {
  if (staleCheckQueued) return;
  staleCheckQueued = true;
  setTimeout(() => { staleCheckQueued = false; dropStaleTooltip(); }, 60);
}

/* ── Argon's target picker ───────────────────────────────────────────────── */
// Clicking an attack opens Argon's "0/1 Targets" picker: it switches the canvas to the Target tool
// and waits for a target. It is bound to the button that opened it, so a shift or revert in the
// meantime left it on screen with the canvas still in Target mode — later clicks targeted tokens
// instead of selecting them, and the attack it finally ran was the old form's. Argon's only cancel
// is a right-click (its picker listens for a right-button mouseup on the document) and the picker
// instance is private to Argon's bundle, so the same right-button mouseup is sent to cancel it:
// when the HUD's token changes body, when a Wild Shape/Starry button is clicked, and on Escape.

export function pickerOpen() {
  return !!document.querySelector(".ech-target-picker");
}

export function cancelTargetPicker() {
  if (!pickerOpen()) return false;
  try {
    document.dispatchEvent(new MouseEvent("mouseup", { button: 2, buttons: 0, bubbles: true, cancelable: true }));
  } catch (err) {
    log.warn("cancelling Argon's target picker failed", err);
  }
  return !pickerOpen();
}

/** Close the module's own open pickers (Change Form / Wild Shape forms, constellations). */
export function closeOwnPickers() {
  const open = document.querySelectorAll(".ptf-picker.show");
  for (const el of open) el.classList.remove("show");   // what ButtonPanel#toggle(false) does; no saved state (id null)
  return open.length > 0;
}

export function itemButtonClass(panel) {
  if (DND5eItemButton) return DND5eItemButton;
  const base = CONFIG.ARGON?.MAIN?.BUTTONS?.ItemButton;
  const slot = base && panel._buttons.find(b => b instanceof base && b._isWeaponSet);
  if (slot) DND5eItemButton = slot.constructor;
  return DND5eItemButton;
}

/** What one bar button is, for the bar plans: weaponSet, item (with its id), split, other. */
export function describeButton(button, { ItemButton, SplitButton }) {
  if (button?._isWeaponSet) return { kind: "weaponSet" };
  if (button instanceof ItemButton) return { kind: "item", id: button.item?.id ?? null };
  if (SplitButton && button instanceof SplitButton) return { kind: "split", ids: [button.button1?.item?.id, button.button2?.item?.id] };
  return { kind: "other" };
}

/** Replace the panel's buttons with `next`, in order, rendering only the new ones. */
export function applyButtons(panel, next, fresh) {
  for (const old of panel._buttons) if (!next.includes(old)) old.element.remove();
  for (const b of next) {
    b._parent = panel;
    panel.element.appendChild(b.element);
  }
  panel._buttons = next;
  for (const b of fresh) b.render();
  panel.updateVisibility();
}
