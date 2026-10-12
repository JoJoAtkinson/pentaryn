// Item marks — a small icon after an item's name on actor sheets, so a player sees at a glance
// that something about it is different (Marrith's curse turns her elemental spells to fire).
//
//   item.flags["pentaryn-ties"].mark = { icon: "fa-fire", tip: "Hover text", color: "#ff7a1a" }
//
// All three fields are optional; the default is an orange flame with no tooltip. The mark is
// drawn into every item row on the sheet (spells, features, inventory), on every render.

import { MODULE } from "./ties-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

const CLASS = "pt-item-mark";
/** A Font Awesome icon class, and nothing else (no spaces, no quotes, no second class). */
const ICON = /^fa-[a-z0-9-]+$/;

export function decorate(app, element) {
  const actor = app?.actor;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!actor?.items || !root) return;
  for (const row of root.querySelectorAll("[data-item-id]")) {
    const mark = actor.items.get(row.dataset.itemId)?.getFlag(MODULE, "mark");
    const title = row.querySelector(".name .title");
    if (!mark || !title || title.querySelector(`.${CLASS}`)) continue;
    const i = document.createElement("i");
    // ties-32: an icon is one Font Awesome class name, or the flame — an item flag is player-writable
    i.className = `${CLASS} fa-solid ${ICON.test(mark.icon ?? "") ? mark.icon : "fa-fire"}`;
    if (mark.color) i.style.color = mark.color;
    if (mark.tip) i.dataset.tooltip = mark.tip;
    title.append(" ", i);
  }
}

/** FEATURE install — called by the entry during `init`; the handler keeps its own try/catch. */
export function install(reg) {
  reg.on("renderBaseActorSheet", (app, element) => {
    try { decorate(app, element); } catch (err) { log.warn(`item marks`, err); }
  }, { label: "item marks" });
}

export function uninstall() {}
