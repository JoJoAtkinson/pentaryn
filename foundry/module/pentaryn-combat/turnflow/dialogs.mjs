/**
 * Roll and usage dialogs (feature; settings escRollDialog, enterUses, tidyCancelledAttacks): Esc
 * closes a dnd5e roll dialog without clicking into it first; Enter in a usage window's number box
 * (Lay on Hands' points) uses the ability; a cancelled attack roll takes its empty usage card with it.
 * Document keydown order (pinned): Esc, then Enter-uses (manual-dice.mjs adds the digits after).
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { running } from "../sequence.mjs";

const log = makeLog(MODULE);

/* ── roll dialogs: Esc, and the card a cancelled attack leaves ───────────── */

function rollDialogFor(target) {
  const host = target?.closest?.(".application.roll-configuration");
  if (host) return foundry.applications.instances.get(host.id) ?? null;
  // Nothing focused (the dialog opened under the cursor without taking focus): the newest roll dialog.
  if (target && target !== document.body && target !== document.documentElement) return null;
  const open = [...document.querySelectorAll(".application.roll-configuration")];
  const top = open.sort((a, b) => (Number(getComputedStyle(b).zIndex) || 0) - (Number(getComputedStyle(a).zIndex) || 0))[0];
  return top ? foundry.applications.instances.get(top.id) ?? null : null;
}

const onEscKey = (ev) => {
  if (ev.key !== "Escape" || !setting("escRollDialog") || running()) return;   // a Full Attack's strip handles its own
  const t = ev.target;
  // Text fields and selects keep their native Esc (blur); a focused button blocks every keybinding.
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  const dialog = rollDialogFor(t);
  if (!dialog) return;
  ev.preventDefault();
  ev.stopPropagation();
  dialog.close();
};

/* ── Enter in a usage window's box uses the ability (setting enterUses) ─── */
// Area 3 re-run (F2): Lay on Hands' "how many points" box took a click on Use Ability after typing,
// or Enter then the click. dnd5e's usage window has no submit button (Use is type="button") and
// re-renders on every change, so Enter only committed the number. Now Enter commits it, waits for
// the window to re-render with it, and presses Use. Text and number boxes only; a select keeps Enter.

const ENTER_TYPES = new Set(["number", "text", "range"]);

function pressUse(app) {
  let done = false;
  const press = () => {
    if (done) return;
    done = true;
    Hooks.off("renderActivityUsageDialog", hook);
    if (!app?.rendered) return;
    app.element?.querySelector?.('[data-action="use"]:not([disabled])')?.click();
  };
  const hook = (rendered) => { if (rendered === app) requestAnimationFrame(press); };
  Hooks.on("renderActivityUsageDialog", hook);
  setTimeout(press, 400);   // a value that did not change re-renders nothing
}

const onEnterKey = (ev) => {
  if (ev.key !== "Enter" || ev.isComposing || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const input = ev.target;
  if (!(input instanceof HTMLInputElement) || !ENTER_TYPES.has(input.type)) return;
  const host = input.closest(".application.activity-usage");
  if (!host || !setting("enterUses")) return;
  const app = foundry.applications.instances.get(host.id);
  if (!app) return;
  ev.preventDefault();
  ev.stopPropagation();
  input.dispatchEvent(new Event("change", { bubbles: true }));
  pressUse(app);
};

const onAttackDialogClosed = (app) => {
  try {
    if (!setting("tidyCancelledAttacks") || app?.rolls?.length) return;
    const origin = app?.message?.data?.system?.origin ?? null;
    const id = typeof origin === "string" ? origin : origin?.id;
    const msg = id ? game.messages.get(id) : null;
    if (!msg || msg.type !== "usage") return;
    // dnd5e posts the attack (if any) after this hook; look again a moment later before deleting.
    setTimeout(() => {
      if (!game.messages.get(msg.id)) return;
      const rolled = game.messages.contents.some(m => m.id !== msg.id && ((m.system?.origin?.id ?? m.system?.origin) === msg.id));
      const keep = !core.orphanUsage({
        mine: msg.author?.id === game.user.id, ageMs: Date.now() - (msg.timestamp ?? 0), rolled,
        consumed: core.deltasConsumed(msg.system?.deltas), sequence: !!running()
      });
      if (!keep) msg.delete().catch(err => log.warn("tidy usage card", err));
    }, 250);
  } catch (err) { log.warn("tidy usage card", err); }
};

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ guard: false, label });

export function install(reg) {
  document.addEventListener("keydown", onEscKey, true);
  document.addEventListener("keydown", onEnterKey, true);
  reg.on("closeAttackRollConfigurationDialog", onAttackDialogClosed, opts("tidy a cancelled attack's card"));
}

export function uninstall() {
  document.removeEventListener("keydown", onEscKey, true);
  document.removeEventListener("keydown", onEnterKey, true);
}
