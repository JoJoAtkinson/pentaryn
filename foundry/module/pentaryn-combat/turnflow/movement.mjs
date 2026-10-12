/**
 * Argon's movement readout follows your Speed (feature, Area 10; pure bug fix, no setting): any
 * effect change on the HUD's actor, a Speed edit or a turn change redraws it (50 ms, batched).
 */

import { DELAYS, MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";

const log = makeLog(MODULE);

/* ── Argon's movement readout follows your Speed (Area 10) ───────────────── */
// Argon redraws the "6/6" movement readout only when the token moves. After Dash (an effect adding
// your Speed) it kept the old maximum, and when Dash ended with no move since, it kept the doubled
// one into the next turn. Any effect change on the HUD's actor, or a Speed edit, redraws it now.
// Pure bug fix, no setting.

function redrawMovement() {
  try {
    const m = ui.ARGON?.components?.movement;
    if (m?.element?.isConnected && ui.ARGON?._token && typeof m.updateMovement === "function") m.updateMovement();
  } catch (err) { log.debug("movement redraw (the next move redraws it)", err); }
}

let movementQueued = false;
function queueMovement(actor) {
  if (!actor || actor !== ui.ARGON?._actor || movementQueued) return;
  movementQueued = true;
  // After dnd5e has prepared the actor again with the effect in or out.
  setTimeout(() => { movementQueued = false; redrawMovement(); }, DELAYS.movementRedraw);
}

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

export function install(reg) {
  for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
    reg.on(hook, (effect) => queueMovement(effect?.parent), opts("movement readout: effect"));
  }
  reg.on("updateActor", (actor, changes) => {
    if (foundry.utils.hasProperty(changes ?? {}, "system.attributes.movement")) queueMovement(actor);
  }, opts("movement readout: Speed"));
  reg.on("combatTurnChange", () => queueMovement(ui.ARGON?._actor), opts("movement readout: turn"));
}

export function uninstall() {
  movementQueued = false;
}
