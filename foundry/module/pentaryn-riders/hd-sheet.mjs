/**
 * Pentaryn Feature Riders — FEATURE: Hit Dice − / + on the character sheet (B4). The sheet only
 * lets you change spent Hit Dice in edit mode (cog → per class). In play mode the Hit Dice label
 * gets a − and a + for whoever can edit the sheet (dnd5e's `.meter.hit-dice` DOM; setting
 * `hdControls`, whose onChange re-renders open character sheets).
 */

import { settingRaw } from "./settings.mjs";
import { hdSummary, restoreHitDie, spendHitDie } from "./shapes.mjs";

let log = null;

function decorateHitDice(app, element) {
  const root = element instanceof HTMLElement ? element : app.element;
  const label = root?.querySelector(".meter.hit-dice")?.closest(".meter-group")?.querySelector(":scope > .label");
  if (!label) return;
  label.querySelector(".pr-hd")?.remove();
  const actor = app.document ?? app.actor;
  if (!settingRaw("hdControls") || app.isEditMode || !app.isEditable || !actor) return;

  const { value, max } = hdSummary(actor);
  const wrap = document.createElement("span");
  wrap.className = "pr-hd";
  const button = (act, icon, tip, disabled) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pr-hd-btn unbutton";
    b.dataset.prHd = act;
    b.dataset.tooltip = tip;
    b.setAttribute("aria-label", tip);
    b.disabled = disabled;
    b.innerHTML = `<i class="fa-solid ${icon}" inert></i>`;
    return b;
  };
  wrap.append(
    button("spend", "fa-minus", _loc("PENTARYN_RIDERS.hd.spend"), value <= 0),
    button("restore", "fa-plus", _loc("PENTARYN_RIDERS.hd.restore"), value >= max)
  );
  wrap.addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-pr-hd]");
    if (!b || b.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    b.disabled = true;
    try {
      if (b.dataset.prHd === "spend") await spendHitDie(actor);
      else await restoreHitDie(actor);
    } catch (err) {
      log.warn("hit die change failed", err);
      b.disabled = false;
    }
  });
  label.append(wrap);
}

function onRenderSheet(app, element) {
  try { decorateHitDice(app, element); } catch (err) { log.warn("hit dice controls skipped", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("renderCharacterActorSheet", onRenderSheet, { guard: false, label: "Hit Dice − / +" });
}

export function uninstall() {}
