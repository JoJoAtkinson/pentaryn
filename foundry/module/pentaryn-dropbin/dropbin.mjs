/**
 * Pentaryn Drop Bin (pentaryn-dropbin) — ENTRY: esmodules[0]. Wiring only, no logic.
 *
 * An append-only ledger of every item that leaves a character, lootable corpses, a Loot all button,
 * and the Item Piles patches the world needs (README "What the player sees").
 *
 * Files, in load order:
 *   loot-core.mjs, ledger-core.mjs   PURE rules (MODULE is defined once, in loot-core)
 *   dropbin-core.mjs     PURE barrel: constants, both cores, pile flags, the backfill planners
 *   settings.mjs         SETTINGS (the ledger's log and counter store rows), readLog, writeLedger
 *   piles.mjs            ADAPTER: every game.itempiles touch (API, drop hook, Svelte store)
 *   socketlib-adapter.mjs ADAPTER: the player → GM ledger relay
 *   corpses.mjs          FEATURE: dead NPCs become lootable piles, the drawn eye, the GM HUD
 *   loot.mjs             FEATURE: the Loot all button
 *   i18n-shim.mjs        FEATURE: the DND5E.ItemRarity* keys itempilesdnd5e still reads
 *   ledger.mjs           FEATURE: capture, record, restore, the JSON mirror
 *   itempiles.mjs        FEATURE: attunement repair, container locks, directory filters, in-view rule
 *   lib/*.mjs            vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: module body → corpses, loot and the shim install; `init` → settings; then the ledger
 * and the Item Piles patches install — synchronously, in this order, so every listener keeps its
 * place against other modules (golden/hooks.json). ready → the ledger arms its capture hooks and
 * publishes game.pentaryn.dropbin; the patches arm theirs.
 *
 * Hot patch RE-RUNS THE WIRING ONLY: `game.pentaryn.dropbin.uninstall()`, then
 * `await import("/modules/pentaryn-dropbin/dropbin.mjs?v=2")`. Any edit to another file needs a reload.
 */

import { MODULE } from "./dropbin-core.mjs";
import { registerSettings, readLog } from "./settings.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { makeLog } from "./lib/log.mjs";
import * as corpses from "./corpses.mjs";
import * as loot from "./loot.mjs";
import * as shim from "./i18n-shim.mjs";
import * as ledger from "./ledger.mjs";
import * as itempiles from "./itempiles.mjs";

/** Features in load order; `init` registers between the shim and the ledger. */
const BEFORE_INIT = [corpses, loot, shim];
const AFTER_INIT = [ledger, itempiles];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const isReady = () => globalThis.game?.ready === true;

const ctx = {
  log,
  reg,
  api: null,
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  /** Run `fn` at `ready`, or now when the world is already ready (a hot re-import). */
  onReady(fn, label) {
    if (isReady()) return void fn();
    reg.once("ready", fn, { label });
  },
  publish,
  uninstall,
};

/**
 * Publish the API, one tick after ready (publishing synchronously is a declared step of the
 * migration). Nothing freezes game.pentaryn since the importer's keystone (items-journal-1).
 */
function publish() {
  setTimeout(publishAPI, 0);
}

function publishAPI() {
  const api = { corpses: corpses.corpses, loot: loot.loot, ...ctx.exposed.ledger };
  game.pentaryn ??= {};
  game.pentaryn.dropbin = api;
  if (game.user.isGM) console.log(`${MODULE} | ready — ${readLog().length} entries on the ledger`);
}

function onInit() {
  registerSettings();
}

/** Remove every hook and feature state (hot patch: then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...BEFORE_INIT, ...AFTER_INIT].reverse()) feature.uninstall();
  reg.offAll();
}

for (const feature of BEFORE_INIT) feature.install(reg, ctx);
if (isReady()) onInit();
else reg.once("init", onInit, { label: "init" });
for (const feature of AFTER_INIT) feature.install(reg, ctx);
