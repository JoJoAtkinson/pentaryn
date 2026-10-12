/**
 * Pentaryn Senses — PURE helpers for the module's buttons (chain.mjs's Token HUD, light-ui.mjs's
 * card, inventory row and Token HUD). They touch only the element handed in: no Foundry global, no
 * `document`, so node imports this file bare.
 */

/**
 * One rule for every button tip (senses-edge-3): the plain-text string, never HTML-escaped first,
 * goes to `data-tooltip-text` (Foundry 14's TooltipManager shows it with textContent, so a name with
 * `& < > " '` reads as typed) and to `aria-label`. Never `data-tooltip`, which Foundry parses as HTML.
 */
export function setTip(el, text) {
  el.dataset.tooltipText = text;
  el.setAttribute("aria-label", text);
}
