/**
 * Argon tooltip hygiene (feature, pure bug fixes plus setting fullAttack): any Argon hover tooltip
 * closes once the pointer is over something that is neither its button nor the tooltip (Area 10),
 * and a roll window, the Roll Resolution window, a dnd5e dialog or the activity chooser opening
 * drops it (it sat on top of the window it opened; usability Area 3).
 */

import { setting } from "../settings.mjs";
import { dropStrayTooltip, dropTooltip } from "../argon.mjs";
import { opts } from "../context.mjs";

// hot: pointerover reads only ui.ARGON._tooltip (no world iteration)
const onPointerOver = (ev) => { if (ui.ARGON?._tooltip) dropStrayTooltip(ev.target); };

export function install(reg) {
  document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true });
  for (const hook of ["renderRollConfigurationDialog", "renderRollResolver", "renderDialog5e", "renderActivityChoiceDialog", "renderDialogV2"]) {
    reg.on(hook, () => { if (ui.ARGON?._tooltip && setting("fullAttack")) dropTooltip(); }, opts("a window opened: drop the HUD tooltip"));
  }
}

export function uninstall() {
  document.removeEventListener("pointerover", onPointerOver, { capture: true, passive: true });
}
