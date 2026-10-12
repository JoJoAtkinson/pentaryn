/**
 * Pentaryn Transform — FEATURE: when the active GM sweeps spent forms (sweep-adapter.mjs): 3 s after
 * a token is deleted or changes its actor, link, delta or dnd5e flags (one timer, never pushed back;
 * a drag, light, hidden or elevation change schedules nothing — perf-1), 1.5 s after a form loses
 * isPolymorphed (a player's revert), and once 3 s after ready (3 s after install on a hot re-import
 * past ready — EC-4).
 */

import { scheduleSweep, cancelSweep } from "./sweep-adapter.mjs";

function sweepSoon() {
  scheduleSweep(3000);
}

function onTokenUpdate(_token, changes) {
  if (changes && ("actorId" in changes || "actorLink" in changes || "delta" in changes || changes.flags?.dnd5e)) sweepSoon();
}

function onFormUpdate(actor, changes) {
  if (!changes?.flags?.dnd5e || !actor.getFlag("dnd5e", "originalActor")) return;
  if (!actor.getFlag("dnd5e", "isPolymorphed")) scheduleSweep(1500);
}

export function install(reg) {
  reg.on("updateToken", onTokenUpdate, { label: "updateToken: sweep spent forms" });
  reg.on("deleteToken", sweepSoon, { label: "deleteToken: sweep spent forms" });
  reg.on("updateActor", onFormUpdate, { label: "updateActor: a reverted form, sweep soon" });
  // A hot re-import after ready (EC-4) sweeps at once instead of waiting on a ready that has fired.
  if (globalThis.game?.ready) sweepSoon();
  else reg.once("ready", sweepSoon, { label: "ready: first sweep" });
}

export function uninstall() {
  cancelSweep();
}
