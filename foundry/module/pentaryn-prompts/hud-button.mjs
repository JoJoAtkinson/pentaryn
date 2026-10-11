/**
 * pentaryn-prompts — FEATURE: an "Edit prompt" button on a marker's Token HUD (GM only); a click
 * opens its box.
 */

import { isPromptToken } from "./markers-adapter.mjs";
import { PromptDialog } from "./dialog.mjs";

function onRenderTokenHUD(ctx, app, element) {
  try {
    const tok = app?.object?.document ?? app?.document;
    if (!game.user?.isGM || !tok || !isPromptToken(tok)) return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
    if (!col || col.querySelector(".pp-hud-btn")) return;
    const label = _loc("PENTARYN_PROMPTS.hud.edit");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "control-icon pp-hud-btn";
    btn.dataset.tooltip = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      PromptDialog.open(tok);
    });
    col.appendChild(btn);
  } catch (err) {
    ctx.log.warn("HUD button skipped", err);
  }
}

export function install(reg, ctx) {
  reg.on("renderTokenHUD", (app, element) => onRenderTokenHUD(ctx, app, element), { guard: false, label: "renderTokenHUD: edit button" });
}

export function uninstall() {}
