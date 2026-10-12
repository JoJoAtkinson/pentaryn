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
// other modules — golden/hooks.json) · ready → build the API (api.mjs), publish it (kit publishNamespace).
//   api-manifest.mjs       PURE API rows (+ STARRY_ROWS, starry.mjs's contribution)
//   api.mjs                implementations, inspect(), selftest(), buildApiFor(ctx)
//
// Design and verified line references: WILDSHAPE-DESIGN.md (this folder).

import { installPatches } from "./patches.mjs";
import { MODULE, NS } from "./transform-core.mjs";
import { publishNamespace } from "./lib/publish.mjs";
import { installFeature, ctx, log } from "./wiring.mjs";
import { buildApiFor } from "./api.mjs";
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

/**
 * Ready: build the API first (a manifest drift is one error line and nothing is published), then
 * publish it synchronously as game.modules.get("pentaryn-transform").api and game.pentaryn.transform
 * (W2-K1: game.pentaryn is a plain object every module assigns into; a frozen one throws here).
 */
function onReady() {
  try {
    ctx.api = buildApiFor(ctx);
  } catch (err) {
    log.error("API manifest drift — not published", err);
    return;
  }
  publishNamespace(NS, ctx.api, { moduleId: MODULE });
}
ctx.expose({ publish: onReady });

// A hot re-import after ready (uninstall(), then import "transform.mjs?v=2" and "hud.mjs?v=2")
// publishes at once; hud.mjs publishes again with Starry's rows.
if (globalThis.game?.ready) onReady();
else Hooks.once("ready", onReady);
