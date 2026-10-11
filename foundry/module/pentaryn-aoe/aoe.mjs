/**
 * Pentaryn AoE — spell areas you can drag and delete, monster saves rolled off the area,
 * damage applied with a GM confirm, and damage rolled automatically on a hit.
 *
 *   areas.mjs    Part A  ownership, handle tokens, delete cascade, Remove all templates, cleanup, sweep
 *   resolve.mjs  Part B  who is inside, NPC saves, the players' request card, Apply
 *   tray.mjs     Part B  the GM-only tray on the damage message
 *   attacks.mjs  Part C  auto damage on hit
 *   effects.mjs  Part D  a spell's effects go on you when you are its only target; unapplied trays light up
 *   escape.mjs   Part E  Escape cancels a spell-area placement on the first press, even with a sheet open
 *   refund.mjs   Part F  a cancelled placement gives back the slot / charge it spent
 *   core.mjs            pure helpers (node-tested in test/run.mjs)
 *
 * dnd5e 6 only (0.3.0). Part E now cancels core's RegionLayer#placeRegions placement (dnd5e 6
 * places areas as regions); core's own Escape only gets there after closing every open window.
 *
 * Design: context/plans/aoe-circles.md · Use: README.md
 *
 * Loads normally as a module. It can also be hot-patched into a running client before the
 * server has scanned it (game.pentaryn.aoe.uninstall() removes every hook it added).
 */

import { MODULE } from "./core.mjs";
import { registerSettings, migrateSettings, setting } from "./settings.mjs";
import { hookIds, offAll } from "./hooks.mjs";
import { installAreas, readyAreas, areasFor, spellAreas, handleFor, removeArea, sweep, ensureHandleActor, createHandle, guardArgonBind } from "./areas.mjs";
import { installResolve, resolve, applyRows, rollNpcSaves, rollForPlayer, pingPlayers, setRow, REQUEST_HANDLER } from "./resolve.mjs";
import { installTray } from "./tray.mjs";
import { installAttacks } from "./attacks.mjs";
import { installEffects, selfApply, pendingFor, cardEffects } from "./effects.mjs";
import { registerEscape, disableEscape, activePlacement } from "./escape.mjs";
import { installRefund } from "./refund.mjs";
import { installAim } from "./aim.mjs";

let installed = false;

function uninstall() {
  offAll();
  disableEscape();
  if (CONFIG.DND5E?.requests?.[REQUEST_HANDLER]) delete CONFIG.DND5E.requests[REQUEST_HANDLER];
  installed = false;
}

const api = {
  areasFor, spellAreas, handleFor, removeArea, sweep, resolve, applyRows, rollNpcSaves, rollForPlayer, pingPlayers,
  setRow, ensureHandleActor, createHandle, selfApply, pendingFor, cardEffects, activePlacement, setting, hookIds, uninstall
};

// pentaryn-importer creates and FREEZES game.pentaryn, so a bare assignment throws in strict
// mode. Rebuild the namespace instead (same pattern as pentaryn-transform).
function publish() {
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, aoe: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.aoe = api;
  }
}

function installHooks() {
  if (installed) return;
  installed = true;
  installAreas();
  installResolve();
  installTray();
  installAttacks();
  installEffects();
  installRefund();
  installAim();
}

/**
 * @param {{sweepOnReady?: boolean}} [opts]  sweepOnReady false skips the startup sweep — used when
 *        hot-patching, so the scene someone is working on is not touched.
 */
export async function install({ sweepOnReady = true } = {}) {
  registerSettings();
  registerEscape();
  installHooks();
  publish();
  guardArgonBind();
  await migrateSettings();
  await readyAreas({ sweepOnReady });
  return api;
}

export { api, uninstall, MODULE };

// Normal module load: settings and the Escape keybinding at init (a keybinding can only be
// registered then), hooks at setup (they only act on later events), namespace and the GM's
// startup work at ready. CONFIG.DND5E.requests exists from dnd5e's init.
if (!globalThis.__pentarynAoeHot) {
  Hooks.once("init", () => {
    registerSettings();
    registerEscape();
  });
  Hooks.once("setup", () => installHooks());
  Hooks.once("ready", () => {
    // Deferred a tick: pentaryn-importer's ready hook (it sorts after "aoe") replaces
    // game.pentaryn with a frozen object, which would drop a key published synchronously here.
    setTimeout(publish, 0);
    // Argon makes ui.ARGON in its own ready hook; a tick later it exists whatever the load order.
    setTimeout(() => { if (!guardArgonBind()) Hooks.once("canvasReady", guardArgonBind); }, 0);
    migrateSettings().catch(err => console.error(`${MODULE} | settings migration`, err));
    readyAreas().catch(err => console.error(`${MODULE} | ready`, err));
  });
}
