/**
 * Pentaryn Senses — PURE helpers for the module's buttons (chain.mjs's Token HUD, light-ui.mjs's
 * card, inventory row and Token HUD). They touch only the element handed in: no Foundry global, no
 * `document` (a new button comes from the column's own ownerDocument), so node imports this file bare.
 * The Token HUD button is built here once (senses-M10): rootOf, hudColumn, hudButton.
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

/** A render hook's element: the HTMLElement itself (v13+), or the first of a jQuery list. */
export function rootOf(element) {
  const El = globalThis.HTMLElement;
  return El && element instanceof El ? element : element?.[0];
}

/**
 * The Token HUD's right-hand column, or null when there is none or it already holds a button
 * with class `cls` (a re-render: add nothing twice).
 */
export function hudColumn(element, cls) {
  const root = rootOf(element);
  const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
  if (!col || col.querySelector(`.${cls}`)) return null;
  return col;
}

/**
 * Append one Token HUD button to `col`: `control-icon <cls>`, the icon, the tip by setTip. A click
 * stops there (no HUD default, no canvas) and runs `onClick`; a throw or rejection goes to `onError`.
 */
export function hudButton(col, { cls, icon, tip, onClick, onError }) {
  const btn = col.ownerDocument.createElement("button");
  btn.type = "button";
  btn.className = `control-icon ${cls}`;
  setTip(btn, tip);
  btn.innerHTML = `<i class="${icon}"></i>`;
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    (async () => onClick())().catch(onError);
  });
  col.appendChild(btn);
  return btn;
}
