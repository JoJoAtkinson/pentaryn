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
 *   ghost.mjs            the feature: install(reg, ctx) / uninstall()
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the feature installs synchronously in this body (where its module-scope Hooks.on
 * calls always ran, so listener order is unchanged) · init → settings · setup → the feature wraps
 * the two core methods · ready → publish game.pentaryn.movement.
 */

import * as core from "./movement-core.mjs";
import { MODULE } from "./movement-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { onSettingChange, registerSettings, setting } from "./settings.mjs";
import { pinInputs } from "./combat-adapter.mjs";
import * as ghost from "./ghost.mjs";

/** Features in load order. */
const FEATURES = [ghost];

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

/** GM/console: pins on a scene whose centre sits under a token. Player-owned tokens listed first. */
function pinsUnderTokens(scene = canvas?.scene) {
  if (!scene) return [];
  const { notes, tokens } = pinInputs(scene);
  return core.pinsUnderTokens(notes, tokens);
}

function onInit() {
  registerSettings();
}

// Published one tick after ready (publishing synchronously is a declared step of the migration). The
// importer merges into game.pentaryn and nothing freezes it since its keystone (items-journal-1), so
// the old frozen-root guard is gone (kit 1.0.2, J10): the API is assigned into the plain root.
function onReady() {
  setTimeout(() => {
    const x = ctx.exposed;
    const api = {
      status: x.status,
      ghostFor: x.ghostFor,
      combatActive: x.combatActive,
      /** Player: switch ghost on/off for yourself (same as the button). */
      setGhost: x.setGhost,
      /** GM: set the policy directly: "off" | "exploration" | "always". */
      setPolicy: async value => {
        if (!game.user.isGM) throw new Error("GM only");
        const p = core.normalizePolicy(value);
        if (p !== "off") await game.settings.set(MODULE, "ghostPolicyLast", p);
        return game.settings.set(MODULE, "ghostPolicy", p);
      },
      pinsUnderTokens,
      core
    };
    game.pentaryn ??= {};
    game.pentaryn.movement = api;
  }, 0);
}

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
