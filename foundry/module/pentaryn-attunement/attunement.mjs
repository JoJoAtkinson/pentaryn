/**
 * Pentaryn Attunement Slots (pentaryn-attunement) — attunement as stored, stable slots in the
 * character sheet sidebar; a warning (never a veto) on every write that can pass the cap; away bonds
 * that let a confiscated attuned item keep its slot and come home attuned; the "Not Proficient"
 * magic-item fix. What the player sees, the data written and the design reasons: README.md and
 * context/plans/foundry-attunement.md.
 *
 * ENTRY (esmodules[0]): wiring only. Files, in load order:
 *   attunement-core.mjs   PURE constants, slot reconciliation, stash plan, bond decision, strings
 *   actor-adapter.mjs     document writes, Item Piles, the two dnd5e adjustments
 *   strip.mjs             UI: the sidebar strip and the counter's over-cap state
 *   sheet.mjs             FEATURE: renderBaseActorSheet, the strip's listeners
 *   bonds.mjs             FEATURE: preUpdateItem, preCreateItem, createItem
 *   api-manifest.mjs      PURE API rows (describe() reads them)
 *   api.mjs               report, inspect, selftest; buildApiFor (the kit-built API)
 *   lib/*.mjs             vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * The features install synchronously in this body, after init and ready are registered: the
 * registration order (golden/hooks.json) is what other modules' listeners were written against.
 */

import { MODULE, NS } from "./attunement-core.mjs";
import { applyProficiencies, guardItemTooltipPosition, unguardItemTooltipPosition } from "./actor-adapter.mjs";
import { buildApiFor } from "./api.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import * as sheet from "./sheet.mjs";
import * as bonds from "./bonds.mjs";

/** Features in load order. */
const FEATURES = [sheet, bonds];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);

/** The hook names the features register; selftest() checks each one is in reg (EXT-8). */
const hookNames = Object.freeze(FEATURES.flatMap(f => f.HOOK_NAMES));

const ctx = { log, reg, api: null, uninstall, hookNames };

function install() {
  for (const feature of FEATURES) feature.install(reg, ctx);
}

/** Remove every hook, feature state and the tooltip guard (then reload, or re-import the entry). */
function uninstall() {
  for (const feature of [...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
  unguardItemTooltipPosition();
}

function onInit() {
  applyProficiencies();
}

/**
 * The tooltip guard first (a throw there must not stop the publish, items-journal-39), then the
 * API: built first so a manifest drift stops here with one clear line, then published at ready —
 * module.api, game.pentaryn.attunement, and the pentaryn-attunement.ready / pentaryn.ready hooks.
 */
function onReady() {
  try {
    guardItemTooltipPosition();
  } catch (err) {
    log.warn("tooltip guard skipped", err);
  }
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
  console.log(`${MODULE} | ready`);
}

Hooks.once("init", onInit);
Hooks.once("ready", onReady);
install();
