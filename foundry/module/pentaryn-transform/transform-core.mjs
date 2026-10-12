/**
 * Pentaryn Transform — PURE core barrel: the blueprint constants, then every rule from core/*.
 *
 * Plain data in, plain data out: no `game`, no `foundry`, no `CONFIG`. The glue files turn live
 * documents into the shapes the rules take and act on the answers. `test/core.test.mjs` imports
 * this file bare, which is the proof that it stays pure.
 *
 *   core/constants.mjs   MODULE, EFFECT_ID, UNIT_SECONDS (what the core/ files share)
 *   core/wildshape.mjs   activities, shaping the form, durations, uses, revert carry-back, shiftBlock, pickRunner
 *   core/hud.mjs         beast tooltip text, the bar plans, Hit Point text
 *   core/starry.mjs      Starry Form: constellations, the effect, the light, starryBlock
 *   core/bodyswap.mjs    isBodySwap (the no-animation guard's test)
 *
 * The core/ files never import this barrel (C16 allows core → core/* only, and it would be a
 * cycle). Explicit import + export lists, not `export *`: the conformance scanner follows them.
 */

import { EFFECT_ID, MODULE } from "./core/constants.mjs";

import {
  activitiesOf, isWildShapeActivity, findWildShapeItem, isStarryFormData, stripReason,
  stripForForm, pruneFavorites, isRevertData, returnLabel, durationSeconds, formatDuration,
  isExpired, usesLeft, useSyncUpdates, carriedConditions, withoutOrigin, endedInForm,
  attributeSync, shiftBlock, pickRunner,
  wildShapeActivityOf, formEntries, refundUpdate, runnerIs, canRunAny, worldTimeCandidates, shapeStatus, shapingPlan
} from "./core/wildshape.mjs";

import {
  withArticle, formatCR, formSummary, planBonusBar, frontRowItems, coveredPanel, formTempHP,
  hpText, planWithout,
  summaryFromSource, recoveryLines, portraitText, earnsChalice, coveredMultiattackId, pruneDisconnected, shouldQueueStaleCheck
} from "./core/hud.mjs";

import {
  CONSTELLATIONS, STARRY_LIGHT, STARRY_SECONDS, constellationOfActivity, starryEffectData,
  grantsFly, starryBlock,
  STARRY_IMG, isGenericActivityImg, constellationImgOf, pickStarryBase, secondsLeft, starryEndKey
} from "./core/starry.mjs";

import {
  isBodySwap,
  unwrapForcedScalars
} from "./core/bodyswap.mjs";

export const SHORT = "transform";
export const NS = "transform";
export const VERSION = "0.3.3";                            // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-transform/api@1";        // bump the major on a published-shape change
export const I18N = "PENTARYN_TRANSFORM";
export const CSS = "ptf-";
export const FLAG_SCOPE = MODULE;

/** Events this module emits: none (it listens only). */
export const HOOKS = Object.freeze({});

export { MODULE, MODULE as MODULE_ID, EFFECT_ID };

export {
  activitiesOf, isWildShapeActivity, findWildShapeItem, isStarryFormData, stripReason,
  stripForForm, pruneFavorites, isRevertData, returnLabel, durationSeconds, formatDuration,
  isExpired, usesLeft, useSyncUpdates, carriedConditions, withoutOrigin, endedInForm,
  attributeSync, shiftBlock, pickRunner,
  wildShapeActivityOf, formEntries, refundUpdate, runnerIs, canRunAny, worldTimeCandidates, shapeStatus, shapingPlan
};

export {
  withArticle, formatCR, formSummary, planBonusBar, frontRowItems, coveredPanel, formTempHP,
  hpText, planWithout,
  summaryFromSource, recoveryLines, portraitText, earnsChalice, coveredMultiattackId, pruneDisconnected, shouldQueueStaleCheck
};

export {
  CONSTELLATIONS, STARRY_LIGHT, STARRY_SECONDS, constellationOfActivity, starryEffectData,
  grantsFly, starryBlock,
  STARRY_IMG, isGenericActivityImg, constellationImgOf, pickStarryBase, secondsLeft, starryEndKey
};

export {
  isBodySwap,
  unwrapForcedScalars
};
