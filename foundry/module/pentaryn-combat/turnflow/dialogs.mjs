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
import { rollDialogOf, isOrphanCard } from "../dialog-adapter.mjs";
import { tempHooks, opts } from "../context.mjs";

const log = makeLog(MODULE);

let hooks = null;                       // the registry install() was given; temporary hooks go through it
const temp = tempHooks(() => hooks);

/* ── roll dialogs: Esc, and the card a cancelled attack leaves ───────────── */

const onEscKey = (ev) => {
  if (ev.key !== "Escape" || !setting("escRollDialog") || running()) return;   // a Full Attack's strip handles its own
  const t = ev.target;
  // Text fields and selects keep their native Esc (blur); a focused button blocks every keybinding.
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  const dialog = rollDialogOf(t);
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
  let id = null;
  const press = () => {
    if (done) return;
    done = true;
    temp.off("renderActivityUsageDialog", id);
    if (!app?.rendered) return;
    app.element?.querySelector?.('[data-action="use"]:not([disabled])')?.click();
  };
  const hook = (rendered) => { if (rendered === app) requestAnimationFrame(press); };
  id = temp.on("renderActivityUsageDialog", hook, "Enter uses: wait for the re-render");
  setTimeout(press, core.DELAYS.useFallback);   // a value that did not change re-renders nothing
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
      const keep = !isOrphanCard(msg, { sequence: !!running() });
      if (!keep) msg.delete().catch(err => log.warn("tidy usage card", err));
    }, core.DELAYS.tidyLook);
  } catch (err) { log.warn("tidy usage card", err); }
};

/* ── install ─────────────────────────────────────────────────────────────── */

export function install(reg) {
  hooks = reg;
  document.addEventListener("keydown", onEscKey, true);
  document.addEventListener("keydown", onEnterKey, true);
  reg.on("closeAttackRollConfigurationDialog", onAttackDialogClosed, opts("tidy a cancelled attack's card"));
}

export function uninstall() {
  hooks = null;
  document.removeEventListener("keydown", onEscKey, true);
  document.removeEventListener("keydown", onEnterKey, true);
}
