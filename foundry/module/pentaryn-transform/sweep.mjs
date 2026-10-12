/**
 * Pentaryn Transform — FEATURE: when the active GM sweeps spent forms (sweep-adapter.mjs): 3 s after
 * token traffic (one timer, never pushed back), 1.5 s after a form loses isPolymorphed (a player's
 * revert), and once 3 s after ready.
 */

import { scheduleSweep, cancelSweep } from "./sweep-adapter.mjs";

function sweepSoon() {
  scheduleSweep(3000);
}

function onFormUpdate(actor, changes) {
  if (!changes?.flags?.dnd5e || !actor.getFlag("dnd5e", "originalActor")) return;
  if (!actor.getFlag("dnd5e", "isPolymorphed")) scheduleSweep(1500);
}

export function install(reg) {
  reg.on("updateToken", sweepSoon, { label: "updateToken: sweep spent forms", guard: false });
  reg.on("deleteToken", sweepSoon, { label: "deleteToken: sweep spent forms", guard: false });
  reg.on("updateActor", onFormUpdate, { label: "updateActor: a reverted form, sweep soon", guard: false });
  reg.once("ready", sweepSoon, { label: "ready: first sweep", guard: false });
}

export function uninstall() {
  cancelSweep();
}
