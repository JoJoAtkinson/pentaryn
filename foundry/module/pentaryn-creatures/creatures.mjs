/**
 * Pentaryn Creatures (pentaryn-creatures) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * A player can always find the creatures they control: a small light on every creature token they
 * own, their own tokens stay drawn on their screen, and a "Your creatures" strip above the hotbar.
 * What each does at the table: README "What the player sees".
 *
 * Files (core first, then the features, then the API):
 *   creatures-core.mjs   PURE constants and rules: the light, owner-sees, strip order, dock, seams
 *   settings.mjs         SETTINGS (lightRadius, ownerSees, floatOverHud, showStrip), setting()
 *   tokens-adapter.mjs   TokenDocument → plain summary (reads aoe / Item Piles / dnd5e flags)
 *   light.mjs            feature: the light queue and its writer (active GM only)
 *   strip.mjs            UI: the strip's DOM, the Combat HUD dock
 *   creature-strip.mjs   feature: when the strip redraws
 *   owner-sees.mjs       feature: the Token#isVisible wrap
 *   summons-adapter.mjs  dnd5e summon activity / source / copy → plain data, the library copy's create data
 *   summons.mjs          feature: the summon library (Actor5e.fetchExisting wrap + the GM relay, dnd5e.postSummon filing)
 *   api-manifest.mjs     PURE API rows (describe() reads them)
 *   api.mjs              implementations over ctx.exposed, buildApiFor(ctx)
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the light and strip features install synchronously in this body (where their
 * module-scope Hooks.on calls always ran, so listener order is unchanged) · init → settings ·
 * setup → owner-sees wraps Token#isVisible, summons wraps Actor5e.fetchExisting (its dnd5e.postSummon
 * listener is registered at load) · the relay queries (manifest rows summonActor, fileLibrary) are
 * registered at load on every client (a player's queryGM needs them) · ready → the active GM syncs every light, the strip
 * draws, then the API is built (a drift throw stops there) and published synchronously as
 * game.modules.get("pentaryn-creatures").api and game.pentaryn.creatures.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.creatures.uninstall()`, then
 * `await import("/modules/pentaryn-creatures/creatures.mjs?v=2")`. Any edit to another file needs
 * a reload.
 */

import { MODULE, NS } from "./creatures-core.mjs";
import { clearSettingHandlers, onSettingChange, registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { makeLog } from "./lib/log.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerQueries } from "./lib/queries.mjs";
import * as light from "./light.mjs";
import * as creatureStrip from "./creature-strip.mjs";
import * as ownerSees from "./owner-sees.mjs";
import * as summons from "./summons.mjs";

/** Features, in install order (uninstall runs them in reverse). */
const FEATURES = [light, creatureStrip, ownerSees, summons];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = {
  log,
  reg,
  setting,
  onSettingChange,
  /** true on a hot re-import after `ready`: the lifecycle hooks have already fired. */
  late: !!globalThis.game?.ready,
  /** the published API (the relay query's handler calls it), set at ready */
  api: null,
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  uninstall,
};

/** Remove every hook, setting handler, the wrap, the strip and the light queue (hot patch: then re-import). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  clearSettingHandlers();
  reg.offAll();
}

function onInit() {
  registerSettings();
}

/** The active GM brings every light in line; every client draws its strip. */
function onReadyStartup() {
  ctx.exposed.syncAllQuietly();
  ctx.exposed.scheduleRender();
}

/** Build the API first (a drift throw stops here with one clear line), then publish it. */
function onReadyPublish() {
  let api;
  try {
    api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  ctx.api = api;
  publishNamespace(NS, api, { moduleId: MODULE });
}

// The manifest's query rows (the summonActor and fileLibrary relays), on every client: a player's queryGM needs the name too.
registerQueries(MANIFEST, () => ctx.api, { log });

// Registration order is the module's historic one (golden/hooks.json): the light's and the strip's
// hooks, init, owner-sees' setup, the summon library's setup and its dnd5e.postSummon, then the two ready handlers.
if (ctx.late) {
  onInit();
  for (const feature of FEATURES) feature.install(reg, ctx);
  onReadyStartup();
  onReadyPublish();
} else {
  light.install(reg, ctx);
  creatureStrip.install(reg, ctx);
  Hooks.once("init", onInit);
  ownerSees.install(reg, ctx);
  summons.install(reg, ctx);
  Hooks.once("ready", onReadyStartup);
  Hooks.once("ready", onReadyPublish);
}
