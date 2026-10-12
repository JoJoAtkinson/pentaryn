/**
 * Pentaryn NPC Ties — the conduit feature: registers the module socket's two listeners (the
 * reverse-side relay and the study conduit) at `ready`, and ends a run of looking when time moves on
 * (FEATURE). Moved out of the entry (guide S7).
 */

import { MODULE } from "./ties-core.mjs";
import { registerRelay } from "./relay.mjs";
import { registerStudy, clearScoping, forgetCombat } from "./study.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

/*
 * **Anything that means time has passed ends the run of looking.**
 *
 * The call-out describes someone *rapidly* working a room — Joe's rule. It is about tempo, so it
 * must only ever count looks that happened in one continuous stretch of standing there. Movement
 * already breaks the run (15 ft, in `scopeTell`); these are the other three events that plainly
 * mean time moved on, and every one of them is something the table *knows* happened:
 *
 *  · **a new scene** — you are not still working the same room in a different building
 *  · **combat starting** — the fiction jumps to structured time, and the per-round rule takes over
 *    governing inspection anyway
 *  · **combat ending** — however long that fight was, it was not "a moment"
 *
 * Cheap to be generous here: a false reset costs one un-said line, while a missed reset has
 * somebody read as paranoid for looks they took an hour ago in another building.
 */
const endLookingRun = why => {
  try {
    clearScoping();
  } catch (err) {
    log.warn(`could not clear inspection tempo (${why})`, err);
  }
};

/**
 * The two GM-side socket listeners (relay, study conduit). Harmless to register on a player client —
 * both check `activeGM` before doing anything but the tempo bubble. Each in its own try/catch: a
 * study conduit that fails to register must not cost the reverse-side relay that has been shipping
 * since 0.9.0.
 */
function registerSockets() {
  for (const [label, register] of [
    ["reverse-side relay", registerRelay],
    ["study conduit", registerStudy]
  ]) {
    try {
      register();
    } catch (err) {
      log.warn(`${label} not registered`, err);
    }
  }
}

/**
 * FEATURE install — synchronous, from the entry body, right after the entry's own init/ready: the
 * socket registration at `ready`, then the four hooks that end a run of looking.
 */
export function install(reg) {
  reg.once("ready", registerSockets, { guard: false, label: "conduit: sockets" });
  reg.on("canvasReady", () => endLookingRun("scene change"), { label: "tempo: scene change" });
  reg.on("combatStart", () => endLookingRun("combat started"), { label: "tempo: combat started" });
  reg.on("deleteCombat", combat => {
    endLookingRun("combat ended");
    forgetCombat(combat?.id); // ties-31: the per-round inspection marks of a finished combat
  }, { label: "tempo: combat ended" });
  /*
   * `combatStart` is not fired by every path that begins a fight (a GM nudging the round forward by
   * hand does not raise it), so watch the round counter too — 0 → 1 is a start whoever caused it.
   */
  reg.on("updateCombat", (combat, changes) => {
    if (changes?.round === 1 || (typeof changes?.round === "number" && changes.round > 0 && !combat.previous?.round)) {
      endLookingRun("first round");
    }
  }, { label: "tempo: first round" });
}

/** The entry's reg.offAll() removes the hooks; the socket listeners stay for the page's life. */
export function uninstall() {}
