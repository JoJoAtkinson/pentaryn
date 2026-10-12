/**
 * Argon's drawers open by their button (feature; setting drawerNearButton, Area 3 E2/F1). Each
 * drawer's toggle is wrapped per instance (Argon builds a new panel on every button render) and
 * places the open drawer above its button, kept inside the row. `placeOpenDrawers` is what the HUD
 * bars call after recomposing (argon-kit applyButtons' `after`).
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { dropDrawerTooltip } from "../argon.mjs";

const log = makeLog(MODULE);

/* ── Argon's drawers open by their button (setting drawerNearButton) ──────── */
// Area 3 (E2, F1): Argon opens every drawer (Use Feature, Cast Spell…) at the action row's far left,
// up to ~370 px from the Bonus-bar button that opened it and partly under the portrait. Each drawer's
// toggle is wrapped per instance (Argon builds a new panel on every button render) and places the
// open drawer above its button, kept inside the row.

function placeDrawer(button, panel) {
  const el = panel?.element;
  if (!el) return;
  if (!setting("drawerNearButton")) { el.style.left = ""; return; }
  if (!el.classList.contains("show")) return;
  const row = el.offsetParent ?? el.parentElement;
  const btn = button?.element;
  if (!row || !btn?.isConnected) return;
  el.style.left = "0px";
  // All screen measurements; Argon scales the HUD (transform: scale), so the drawer's own `left` is
  // the screen distance divided by that scale (Area 4: the Wild Shape picker sat under the portrait).
  const r = row.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const scale = row.offsetWidth ? r.width / row.offsetWidth : 1;
  // The drawer starts right of the portrait and the movement bar (the action row), and ends inside
  // the HUD element's box: that box is the drawer's containing block, so a drawer pushed past it
  // wraps its tiles onto a second row instead of overflowing.
  const lane = row.querySelector?.(":scope > .action-hud")?.getBoundingClientRect() ?? r;
  el.style.left = `${core.drawerLeft({
    buttonLeft: b.left, hudLeft: r.left, hudWidth: r.width,
    panelWidth: el.getBoundingClientRect().width + 2, minLeft: lane.left, scale   // +2: a sub-pixel short row wraps
  })}px`;
}

const onDrawerButton = (button) => {
  try {
    const panel = button?.panel;
    if (!panel || panel._pcNear || typeof panel.toggle !== "function") return;
    panel._pcNear = true;
    const own = panel.toggle;
    panel.toggle = function (...args) {
      const out = own.apply(this, args);
      try { placeDrawer(button, this); } catch (err) { log.debug("place drawer (Argon's place)", err); }
      if (!this.element?.classList?.contains("show")) dropDrawerTooltip(this);
      return out;
    };
    // Area 10: a bar re-render (Pole Strike appearing) builds a new drawer that Argon reopens from
    // its saved state inside its own render, before this wrapper exists, so it opened at the HUD's
    // far left, detached from its button. Place it once the bar has laid out.
    if (panel.element?.classList?.contains("show")) placeWhenLaidOut(button, panel);
  } catch (err) { log.debug("drawer wrap", err); }   // never break Argon's render
};

/**
 * Place an open drawer once its button is on the page. A whole-HUD render (a new turn) attaches the
 * bars after the buttons render, so one frame was not always enough and a restored drawer stayed at
 * Argon's far left, over the Action bar's Cast Spell (Area 3 re-run, F1). Up to ~10 frames.
 */
function placeWhenLaidOut(button, panel, tries = 10) {
  requestAnimationFrame(() => {
    try {
      if (!panel?.element?.classList?.contains("show")) return;
      const btn = button?.element;
      if (btn?.isConnected && btn.getBoundingClientRect().width > 0) placeDrawer(button, panel);
      else if (tries > 1) placeWhenLaidOut(button, panel, tries - 1);
    } catch (err) { log.debug("place drawer when laid out (Argon's place)", err); }
  });
}

/** Re-place the open drawers of a bar whose buttons moved (hud.mjs calls it after recomposing). */
export function placeOpenDrawers(actionPanel) {
  for (const b of actionPanel?._buttons ?? []) {
    const p = b?.panel;
    if (!p?.element?.classList?.contains?.("show")) continue;
    placeWhenLaidOut(b, p);
  }
}

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

// hot: per-panel marker (_pcNear); no world iteration
export function install(reg) {
  reg.on("renderButtonPanelButtonArgonComponent", onDrawerButton, opts("drawers open by their button"));
}

export function uninstall() {}
