/**
 * Manual dice: the Roll Resolution box takes the digits (feature; tied to setting dockRollDialogs,
 * Area 3 P). The first empty box is focused on render, and a digit typed with nothing focused goes
 * into it. Its keydown listener is the third document keydown (after dialogs.mjs's Esc and Enter).
 */

import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { openRollResolvers } from "../dialog-adapter.mjs";
import { opts } from "../context.mjs";

const log = makeLog(MODULE);

/* ── manual dice: the Roll Resolution box takes the digits ───────────────── */
// Area 3 (P): the resolver's box was not always focused (it opens while the roll window closes, and
// the window docking moves it), so typed numbers went to the canvas and fired pentaryn-ties' 1–9
// hotkeys. The first empty box is focused on render, and a digit typed with nothing focused goes
// into it. Tied to `dockRollDialogs` (the manual-dice part of the roll-window handling).

function openResolver() {
  let top = null;
  for (const app of openRollResolvers()) {
    if (!app.element?.isConnected) continue;
    if (!top || (Number(app.position?.zIndex) || 0) >= (Number(top.position?.zIndex) || 0)) top = app;
  }
  return top;
}

function firstEmptyBox(app) {
  const inputs = [...(app?.element?.querySelectorAll?.("input:not([disabled]):not([readonly])") ?? [])];
  return inputs.find(i => i.value === "") ?? inputs[0] ?? null;
}

const onResolverRendered = (app) => {
  if (!setting("dockRollDialogs")) return;
  requestAnimationFrame(() => {
    try {
      if (app.element?.contains(document.activeElement)) return;
      firstEmptyBox(app)?.focus();
    } catch (err) { log.debug("resolver focus (the player clicks the box)", err); }
  });
};

const onDigitKey = (ev) => {
  if (!/^[0-9]$/.test(ev.key) || ev.ctrlKey || ev.metaKey || ev.altKey || !setting("dockRollDialogs")) return;
  const t = ev.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
  const box = firstEmptyBox(openResolver());
  if (!box) return;
  // Focus moves before the key's default action, so the digit is typed into the box; core's
  // keybindings (window, bubble phase) never see it.
  ev.stopPropagation();
  box.focus();
};

/* ── install ─────────────────────────────────────────────────────────────── */

export function install(reg) {
  reg.on("renderRollResolver", onResolverRendered, opts("focus the Roll Resolution box"));
  document.addEventListener("keydown", onDigitKey, true);
}

export function uninstall() {
  document.removeEventListener("keydown", onDigitKey, true);
}
