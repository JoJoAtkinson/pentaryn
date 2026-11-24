/**
 * Pentaryn Movement (pentaryn-movement) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * Two fixes from the 2026-10-08 table feedback (plan C2): a player's own tokens draw on top on
 * their screen, and a ghost button lets a player move their own tokens through walls and creatures
 * under a GM policy. Why it needs no GM relay, and what it wraps: README "How it works".
 *
 * Files, in load order:
 *   movement-core.mjs    PURE constants, label key maps, the policy / sort / pin rules
 *   settings.mjs         SETTINGS table, setting(), onSettingChange()
 *   combat-adapter.mjs   combats and scenes → plain core inputs (reads only)
 *   api-manifest.mjs     PURE API rows (describe() reads them)
 *   api.mjs              implementations, selftest()
 *   ghost.mjs            the feature: install(reg, ctx) / uninstall()
 *   ghost-combat.mjs     the GM's ghost-in-combat flag (Token HUD toggle, setGhost(ref, { combat }), inspect)
 *   pathfind-core.mjs    PURE A*, string pulling and corner arcs (drag pathfinding, 0.3.0)
 *   pathfind-adapter.mjs a Token and its drag options → the step tests the search uses (reads only)
 *   pathfind.mjs         the feature: wraps Token#findMovementPath
 *   motion-core.mjs      PURE trajectories, the cell chain, the group / click decision tables (0.4.0)
 *   group-core.mjs       PURE cuts, the flood, one undo entry per move, tokens that start stacked (0.4.0; 0.10 L2)
 *   group-adapter.mjs    tokens and drag contexts → member records and oracles (reads only)
 *   file-core.mjs        PURE the leader plan (planLead) and its motion (staggerFile) (0.10)
 *   file.mjs             the feature: a group drag out of combat, which tokens move together (0.9.0)
 *   drop.mjs             the feature: wraps Token#_prepareDragLeftDropUpdates (single drops, groups, a fight's every square; 0.9.0)
 *   stop.mjs             the feature: wraps Token#_onClickLeft (click to stop)
 *   telemetry-core.mjs   PURE the telemetry ring buffer and the circuit breaker's rule (0.8.0)
 *   telemetry.mjs        the feature: telemetry, the circuit breaker, the "that move was wrong" key (0.8.0)
 *   lib/*.mjs          vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the feature installs synchronously in this body (where its module-scope Hooks.on
 * calls always ran, so listener order is unchanged) · init → settings · setup → the feature wraps
 * the two core methods · ready → build the API first (a drift throw stops here with one clear
 * line), then publish it as game.modules.get("pentaryn-movement").api and game.pentaryn.movement.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.movement.uninstall()`, then
 * `await import("/modules/pentaryn-movement/movement.mjs?v=2")`. Any edit to another file needs a
 * reload.
 */

import { MODULE, NS } from "./movement-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { registerQueries } from "./lib/queries.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { migrateSettings, onSettingChange, registerSettings, setting } from "./settings.mjs";
import { buildApiFor } from "./api.mjs";
import * as ghost from "./ghost.mjs";
import * as ghostCombat from "./ghost-combat.mjs";
import * as pathfind from "./pathfind.mjs";
import * as drop from "./drop.mjs";
import * as file from "./file.mjs";
import * as stop from "./stop.mjs";
import * as telemetry from "./telemetry.mjs";

/** Features in load order (ghost first: its hooks have always registered first; pathfind 0.3.0; the drop (0.9.0, was group) and stop 0.4.0; the file 0.9.0; telemetry 0.8.0, last: the others call it only at run time). */
const FEATURES = [ghost, ghostCombat, pathfind, drop, file, stop, telemetry];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

const ctx = {
  log,
  reg,
  setting,
  onSettingChange,
  /** true on a hot re-import after `ready`: the lifecycle hooks have already fired. */
  late: !!globalThis.game?.ready,
  api: null,
  contributions: [],
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  uninstall,
};

function install() {
  for (const feature of FEATURES) {
    const contribution = feature.install(reg, ctx);
    if (contribution) ctx.contributions.push(contribution);
  }
}

/** Remove every hook and feature state (hot patch: then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

function onInit() {
  registerSettings();
}

function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  // 0.8.0: the retired rows' stored values carried over once (the active GM writes; every client drops its folded rows).
  migrateSettings().then(r => { if (Object.keys(r.world).length || Object.keys(r.client).length) log.info("settings migrated (0.8.0)", r); })
    .catch(err => log.debug("settings migration", err));
}

// The manifest's relay row (stop: a player's click asks the active GM), on every client: the sender needs the name too.
registerQueries(MANIFEST, () => ctx.api, { log });

// Registration order is the module's historic one: init, then the feature's hooks (installed
// synchronously, at the moment its module-scope Hooks.on calls used to run), then ready.
if (ctx.late) {
  onInit();
  install();
  onReady();
} else {
  Hooks.once("init", onInit);
  install();
  Hooks.once("ready", onReady);
}
