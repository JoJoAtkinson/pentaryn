/**
 * Pentaryn Combat (pentaryn-combat) — ENTRY #1 = esmodules[0]. Wiring only.
 *
 * Melee on the Argon HUD with fewer clicks and nothing taken away:
 *   Full Attack     one button runs every swing the Attack action gives (Extra Attack, Nick, an
 *                   NPC's or a Wild Shape form's Multiattack), each through dnd5e's own dialog.
 *   Swing pips      the Action pips count swings (2 → 1 → 0), also for weapons clicked by hand.
 *   Follow-ups      Off-hand / Nick / Flurry of Blows / Martial Arts / Hew as one click each, only
 *                   when the actor qualifies right now.
 *   Riders          "+ Sneak Attack 3d6" (and Frenzy, Colossus Slayer, Divine Strike) offered on
 *                   the attack card once per turn; auto mode per player.
 *   Corrections     off-hand mode reset and pip, TWF/GWM damage, empty weapon sets seeded.
 *
 * Load order (the hooks golden pins it):
 *   combat.mjs  evaluates → roll-dock installs; once(init) settings; once(setup) counting,
 *               turn-riders, offhand, sequence; once(ready) build + publish the API (api.mjs), then
 *               the active GM's weapon-set seed one tick later
 *   hud.mjs     evaluates → the turn-flow features, then the HUD features (its own header)
 *
 * Files: combat-core.mjs (pure) · settings.mjs · api-manifest.mjs, api.mjs · context.mjs (shared
 * wiring) · shapes.mjs, argon.mjs, dialog-adapter.mjs (adapters) · strip.mjs (ui) · features:
 * roll-dock, counting, turn-riders, offhand, sequence · hud.mjs and its hud/, turnflow/ features ·
 * lib/ (vendored kit).
 *
 * Design: context/plans/melee-streamlining.md · Use: README.md · Exposes game.pentaryn.combat.
 */

import { MODULE, NS } from "./combat-core.mjs";
import { ctx, installFeature, log } from "./context.mjs";
import { registerSettings } from "./settings.mjs";
import { renderHud } from "./argon.mjs";
import { buildApiFor } from "./api.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { isActiveGM } from "./lib/election.mjs";
import { seedAll } from "./offhand.mjs";
import * as rollDock from "./roll-dock.mjs";
import * as counting from "./counting.mjs";
import * as turnRiders from "./turn-riders.mjs";
import * as offhand from "./offhand.mjs";
import * as sequence from "./sequence.mjs";

/** Installed while this file evaluates: the roll-window hooks keep their place ahead of everyone. */
const AT_LOAD = [rollDock];
/** Installed at setup, in registration order (the runner registers no hook; it contributes API rows). */
const AT_SETUP = [counting, turnRiders, offhand, sequence];

for (const feature of AT_LOAD) installFeature(feature);

function onInit() {
  registerSettings({ onChange: renderHud });
}

function onSetup() {
  for (const feature of AT_SETUP) installFeature(feature);
}

/**
 * Build the API first (a manifest drift stops here with one error line), publish it (module.api,
 * game.pentaryn.combat, pentaryn-combat.ready) synchronously (W2-K1), then the active GM's
 * weapon-set seed, still one tick later as before.
 */
function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  setTimeout(() => {
    if (isActiveGM()) seedAll().catch(err => log.warn("weapon-set seed failed", err));
  }, 0);
}

if (globalThis.game?.ready) {
  // A hot re-import after the world is ready (after api.uninstall()): run the phases now, in order.
  // It re-wires only this entry's features; hud.mjs's need a reload. Registered settings are skipped.
  onInit();
  onSetup();
  onReady();
} else {
  Hooks.once("init", onInit);
  Hooks.once("setup", onSetup);
  Hooks.once("ready", onReady);
}
