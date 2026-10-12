/**
 * Pentaryn Feature Riders — FEATURE: the card note. The damage riders' message flag
 * (flags.pentaryn-riders, damage-riders.mjs) becomes one line under a damage card's dice row:
 * "Elemental Adept: 1s count as 2 · Elemental Affinity +4".
 */

import { MODULE, noteParts } from "./riders-core.mjs";

let log = null;

// dnd5e 6 removes the header flavor from roll cards that carry an item header
// (roll-message-data.mjs `_onRender`), so the note is a line of its own under the dice row,
// rebuilt from flags.pentaryn-riders on every render. Hidden when the roll itself is private.
function renderNote(message, html) {
  if (!html?.querySelector) return;
  html.querySelector(".pentaryn-riders-note")?.remove();
  const flag = message?.flags?.[MODULE];
  if (!flag?.applied?.length || !["damage", "healing"].includes(message.type) || !message.isContentVisible) return;
  const parts = noteParts(flag);
  if (!parts.length) return;
  const text = parts.map(p => {
    if (p.kind === "bonus") return _loc("PENTARYN_RIDERS.note.bonus", { label: p.label, value: p.value });
    if (p.kind === "min") return _loc("PENTARYN_RIDERS.note.min", { label: p.label, n: p.n });
    if (p.kind === "reroll") return _loc("PENTARYN_RIDERS.note.reroll", { label: p.label });
    return p.label;
  }).join(" · ");
  const note = document.createElement("p");
  note.className = "supplement pentaryn-riders-note";
  note.textContent = text;
  const content = html.querySelector(".message-content") ?? html;
  const row = content.querySelector(":scope > section.icon-row");
  if (row) row.after(note);
  else content.append(note);
}

function onRender(message, html) {
  try { renderNote(message, html); } catch (err) { log.warn("card note skipped", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dnd5e.renderChatMessage", onRender, { guard: false, label: "card note" });
}

export function uninstall() {}
