/**
 * Argon's target picker, reused for a Retarget through a hidden button, and its one-time tutorial
 * (feature; setting skipPickerGuide, U-R-2 and Area 2 A2). Registers with the runner
 * (sequence.registerTargetPicker, test/graph-allow.json) while hud.mjs evaluates, as before.
 */

import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting, argonSetting, setArgonSetting, hasArgonSetting } from "../settings.mjs";
import { releaseTargets } from "../argon.mjs";
import { argonClasses } from "./buttons-ui.mjs";
import { registerTargetPicker } from "../sequence.mjs";
import { opts } from "../context.mjs";

const log = makeLog(MODULE);

/* ── Argon's target picker, reused through a hidden button ───────────────── */

function argonPickerOn() {
  return !!argonSetting("rangepicker", () => false);
}

/** Argon's picker for a Retarget; undefined when it can't run (the sequence then waits for targetToken). */
async function argonPicker(activity) {
  const C = argonClasses();
  if (!C || !argonPickerOn() || !ui.ARGON?._token) return undefined;
  // "New target" means a new one. With Argon's rangepickerclear off (U-R-1: a pre-set target is
  // kept for weapons clicked by hand) its picker would see the old target, call 1/1 done and end at
  // once, so the swing would go to the old target. Clear first, whatever that setting says.
  releaseTargets();
  const probe = new C.PickerProbe({ activity });
  let picked = false;
  probe._onLeftClick = async () => { picked = true; };
  await probe._onPreLeftClick(new MouseEvent("mouseup", { button: 0 }));
  return picked && game.user.targets.size > 0;
}

/* ── Argon's Target Picker Tutorial (U-R-2, setting skipPickerGuide) ─────── */
// Argon shows a one-time "Target Picker Tutorial" dialog (Confirm to continue) the first time a
// browser opens its picker, usually mid-combat. Its flag is a client setting, so every client marks
// it seen on ready. The tutorial's one tip a player needs at the moment of picking, right-click
// cancels, goes on Argon's own cursor label instead (CSS ::after, styles/combat.css).

function applyPickerGuide() {
  const on = !!setting("skipPickerGuide");
  cueListening(on);
  try {
    document.body.classList.toggle("pentaryn-combat-picker-cue", on);
    if (on) document.body.style.setProperty("--pentaryn-combat-picker-cue", JSON.stringify(_loc("PENTARYN_COMBAT.Hud.PickerCue")));
  } catch (err) { log.debug("picker cue (no body yet)", err); }
  if (!on || !hasArgonSetting("targetPickerGuideShown")) return;
  const warn = err => log.warn("marking Argon's picker tutorial seen failed", err);
  try {
    // ac-1: settings.set is async; a rejected write is warned here, a throwing read by the catch
    if (!argonSetting("targetPickerGuideShown")) Promise.resolve(setArgonSetting("targetPickerGuideShown", true)).catch(warn);
  } catch (err) { warn(err); }
}


/**
 * Area 2 (A2): Argon's "0/1 Targets" label is created empty at the page's top-left and only moves
 * (and gets its text) on the first mousemove, so a player who had not moved yet saw the cue pinned
 * in the corner. Place it at the pointer (where the HUD button was clicked) with a starting text.
 */
let pointer = null;
let observer = null;
// hot: pointermove only stores the last position
const onPointer = (ev) => { pointer = { x: ev.clientX, y: ev.clientY }; };
const placeCue = (records) => {
  if (!document.body.classList.contains("pentaryn-combat-picker-cue")) return;
  for (const r of records) for (const n of r.addedNodes) {
    if (!(n instanceof HTMLElement) || !n.classList.contains("ech-target-picker")) continue;
    if (pointer && !n.style.left) { n.style.left = `${pointer.x + 20}px`; n.style.top = `${pointer.y}px`; }
    if (!n.textContent) n.textContent = _loc("PENTARYN_COMBAT.Hud.PickerStart");
  }
};

/* ── install ─────────────────────────────────────────────────────────────── */

/**
 * combat-riders-35 [declared D-c4]: the cue's pointer listeners and its observer exist only while
 * skipPickerGuide is on. At install the setting is not registered yet, so its default (on) adds the
 * listeners where they always were; switching it off removes them and disconnects the observer,
 * and switching it back on adds them again (the first pick after that may have no pointer yet).
 */
let listening = false;
let cueReady = false;

function cueListening(on) {
  if (on && !listening) {
    document.addEventListener("pointermove", onPointer, { capture: true, passive: true });
    document.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
    listening = true;
  } else if (!on && listening) {
    document.removeEventListener("pointermove", onPointer, { capture: true, passive: true });
    document.removeEventListener("pointerdown", onPointer, { capture: true, passive: true });
    listening = false;
    pointer = null;
  }
  if (on && cueReady && !observer) {
    observer = new MutationObserver(placeCue);
    observer.observe(document.body, { childList: true });
  } else if (!on && observer) {
    observer.disconnect();
    observer = null;
  }
}

export function install(reg) {
  registerTargetPicker(argonPicker);
  reg.once("ready", applyPickerGuide, opts("Argon's picker tutorial: seen"));
  cueListening(!!setting("skipPickerGuide"));
  reg.once("ready", () => {
    cueReady = true;
    cueListening(!!setting("skipPickerGuide"));
  }, opts("picker cue: place Argon's target label"));
  // The first change from the default creates the Setting document; later ones update it.
  for (const hook of ["createSetting", "updateSetting"]) {
    reg.on(hook, (s) => { if (s?.key === `${MODULE}.skipPickerGuide`) applyPickerGuide(); }, opts("picker cue setting"));
  }
}

export function uninstall() {
  registerTargetPicker(null);
  cueListening(false);
  cueReady = false;
}
