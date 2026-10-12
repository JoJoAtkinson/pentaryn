/**
 * Pentaryn Transform — ADAPTER: Argon's target picker and the tooltip manager. The shared Argon helpers
 * (applyButtons, itemButtonClass, slotKind, paintBadge, dropTooltip) are the kit's lib/argon-kit.mjs,
 * vendored byte-identical into pentaryn-combat too (transform-creatures-12). Rows
 * argon-target-picker-cancel, argon-tooltip-clear (foundry/adjustments.yml).
 */

import { MODULE, shouldQueueStaleCheck } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { dropTooltip as dropArgonTooltip } from "./lib/argon-kit.mjs";

const log = makeLog(MODULE);

/* ── tooltips ────────────────────────────────────────────────────────────── */
// Argon shows its tooltips through Foundry's TooltipManager, anchored to the hovered button. Every
// shift and revert rebuilds the HUD, so that button leaves the DOM without a pointerleave and the
// tooltip stayed on screen until the mouse found another tooltipped element. Any tooltip whose
// anchor is gone is dropped: after each HUD render, and on the next pointer move.

/** Close core's tooltip and forget Argon's hover tooltip; never throws (kit argon-kit, D7 / -12). */
export function dropTooltip() {
  dropArgonTooltip({ log });
}

export function dropStaleTooltip() {
  const anchor = game.tooltip?.element;
  if (anchor && !anchor.isConnected) dropTooltip();
}

let staleCheckQueued = false;

/**
 * The capture-phase pointermove listener (hud-panels installs it): one stale-tooltip check per 60 ms,
 * armed only while a tooltip is up whose anchor has already left the DOM (transform-creatures-11).
 */
export function onPointerMove() {
  // hot: reads game.tooltip.element and a flag only
  if (!shouldQueueStaleCheck({ anchor: game.tooltip?.element ?? null, queued: staleCheckQueued })) return;
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
