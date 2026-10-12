// Pentaryn Transform Controls (pentaryn-transform) — ENTRY 0 (esmodules[0]). Wiring only, no logic.
//
// Wild Shape as one HUD click, revert from an item, and the end-of-form rules dnd5e leaves to the
// table; Starry Form; the Argon HUD. Files, in load order:
//   transform-core.mjs     PURE barrel over core/* (constants, rules)
//   settings.mjs           the Escape keybinding row; the two outside settings reads
//   patches.mjs            the core v14 _preUpdateOperation unwrap (wrapMethod)
//   wiring.mjs             the one log / hook registry / ctx both entries share
//   wildshape-adapter.mjs  shift, revert, lookups, chat, the bonus-action mark, who runs what
//   sweep-adapter.mjs      the active GM's sweep of spent forms
//   bodyswap.mjs, wildshape.mjs, sweep.mjs   features installed here, in this order
//   hud.mjs (esmodules[1]) installs starry.mjs and hud-panels.mjs (with starry-adapter.mjs,
//                          starry-dialog.mjs, argon.mjs, form-picker.mjs)
//   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
//
// Lifecycle: the patch, then every feature installs synchronously while this file loads (the moment
// their module-scope hooks always registered; moving them to `setup` would reorder them against
// other modules — golden/hooks.json) · ready → publish.
//
// Design and verified line references: WILDSHAPE-DESIGN.md (this folder).

import { installPatches } from "./patches.mjs";
import { installFeature, reg } from "./wiring.mjs";
import {
  shift, revert, forms, wildShapeActivity, original, isRevertItem, isRunner, markBonusUsed, bonusUsedNow, say,
  returnToNormal, isWildShapeForm
} from "./wildshape-adapter.mjs";
import { sweepSpentForms } from "./sweep-adapter.mjs";
import * as bodyswap from "./bodyswap.mjs";
import * as wildshape from "./wildshape.mjs";
import * as sweep from "./sweep.mjs";

export {
  shift, revert, forms, wildShapeActivity, original, isRevertItem, sweepSpentForms, isRunner, markBonusUsed, bonusUsedNow,
  say, returnToNormal, isWildShapeForm
};

/** Features this entry installs, in load order (hud.mjs installs starry and the HUD panels after). */
const FEATURES = [bodyswap, wildshape, sweep];

/* ── the core v14 operator unwrap: applied now, before any preUpdateToken listener ── */
installPatches();

for (const feature of FEATURES) installFeature(feature);

// pentaryn-importer creates and FREEZES game.pentaryn, so a bare assignment throws in
// strict mode. Rebuild the namespace instead (same pattern as pentaryn-ties).
function onReady() {
  const api = { shift, revert, forms, wildShapeActivity, original, isRevertItem, sweepSpentForms };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, transform: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.transform = api;
  }
}

reg.once("ready", onReady, { label: "ready: publish game.pentaryn.transform", guard: false });
