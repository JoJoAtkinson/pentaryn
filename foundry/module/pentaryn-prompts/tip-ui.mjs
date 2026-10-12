/**
 * pentaryn-prompts — UI: the hover tip over a prompt marker (its text, size and footprint, then
 * "sees N" a tick later). DOM only; the tooltip feature decides when it shows.
 */

import { footprintLabel } from "./geometry-core.mjs";
import { markerSizeOfToken, promptText } from "./markers-adapter.mjs";
import { seesCount } from "./scene-adapter.mjs";

let tip = null;
let tipToken = null;

/** The token id the tip is showing, or null. */
export function tipFor() {
  return tipToken;
}

export function hideTip() {
  tip?.remove();
  tip = null;
  tipToken = null;
}

/** Show the tip for a marker placeable (replacing any other); the sight count fills in a tick later. */
export function showTip(token) {
  hideTip();
  const doc = token.document;
  const size = markerSizeOfToken(doc);
  const text = promptText(doc);
  const g = canvas.grid.size;
  const c = canvas.clientCoordinatesFromCanvas({ x: doc.x + doc.width * g, y: doc.y });
  tip = document.createElement("div");
  tip.className = "pentaryn-prompts-tip";
  const shown = text.length > 600 ? `${text.slice(0, 600).trimEnd()}…` : text;
  const esc = foundry.utils.escapeHTML;
  tip.innerHTML = `<div class="pp-tip-text">${shown ? esc(shown).replace(/\n/g, "<br>") : `<em>${esc(_loc("PENTARYN_PROMPTS.panel.empty"))}</em>`}</div>
    <div class="pp-tip-meta">${esc(`${size} · ${footprintLabel(size, canvas.scene?.grid?.distance ?? 5)}`)} · <span data-sees>…</span></div>`;
  tip.style.left = `${Math.round(c.x + 12)}px`;
  tip.style.top = `${Math.round(c.y)}px`;
  document.body.appendChild(tip);
  tipToken = token.id;
  const mine = tip;
  setTimeout(() => {
    if (tip !== mine) return;
    const n = seesCount(doc);
    const el = mine.querySelector("[data-sees]");
    if (el) el.textContent = n === null ? "" : _loc("PENTARYN_PROMPTS.hud.sees", { n });
  }, 0);
}
