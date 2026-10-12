/**
 * pentaryn-prompts — the pure core.
 *
 * Everything here is a function of plain data: no `game`, no `canvas`, no `foundry`. The dialog's
 * side panel and the gather text both go through it, so what Joe sees beside a marker and what
 * Claude reads about it can never disagree. `node test/run.mjs` proves it.
 *
 * Units: positions are canvas pixels unless a name says `Ft`; a "square" is a grid offset {i, j}
 * (i = row, j = column, as Foundry's GridOffset2D).
 */

// MODULE and VERSION live in prompts-core.mjs; the rest in core/*.mjs. This file is the barrel every
// importer already uses: the PUBLIC names only (golden/core-exports.json), never a core file's helpers.
export { MODULE, VERSION } from "./prompts-core.mjs";

import { DND_SIZE_WIDTH, SIZES, SIZE_BY_KEY, SIZE_KEYS, footprintLabel, footprintSquares } from "./core/size.mjs";
import { BANDS, COMPASS, DIAGONALS, HEX_RULE, band, bearing, dedupeSquares, gaplessDistanceFt, nearestPair, occupiedSquares, squareDistanceFt, stepCost } from "./core/grid.mjs";
import { DIR, DOOR, DOOR_STATE, SENSE, classifyBlocked, classifySight, isSeen, orient, rayPasses, segmentT, thresholdApplies, wallSegment } from "./core/sight.mjs";
import { builtDescription, callId, fnv1a, idCompare, isoDate, nameplate, normalisePrompt, ownTextUuid, preview, previewSentences, relationText, sortRelations, stripEnrichers, stripHtml, textHash } from "./core/text.mjs";
import { ENCOUNTER_XP, crXp, difficulty, parseParty, xpBudget } from "./core/xp.mjs";
import { assignIds, components, groupScene } from "./core/group.mjs";
import { doorLines } from "./core/doors.mjs";
import { CURRENT_SCENE, atFeet, behindDoor, dialogPosition, distanceLine, needsLockSize, panelSplit, placementFor, sceneRefs } from "./core/placement.mjs";
import { CREATURE_KINDS, buildView, makeRel, testPoints } from "./core/view.mjs";
import { GATHER_CHARS, LEGEND, SEES_CAP, classLabel, crText, itemText, itemsText, lightText, partyLine, renderGather, statsText } from "./core/gather-text.mjs";
import { CODES, codedError, errorCode } from "./core/errors.mjs";

export { DND_SIZE_WIDTH, SIZES, SIZE_BY_KEY, SIZE_KEYS, footprintLabel, footprintSquares, BANDS, COMPASS,
  DIAGONALS, HEX_RULE, band, bearing, dedupeSquares, gaplessDistanceFt, nearestPair, occupiedSquares,
  squareDistanceFt, stepCost, DIR, DOOR, DOOR_STATE, SENSE, classifyBlocked, classifySight, isSeen, orient,
  rayPasses, segmentT, thresholdApplies, wallSegment, builtDescription, callId, fnv1a, idCompare, isoDate,
  nameplate, normalisePrompt, ownTextUuid, preview, previewSentences, relationText, sortRelations,
  stripEnrichers, stripHtml, textHash, ENCOUNTER_XP, crXp, difficulty, parseParty, xpBudget, assignIds,
  components, groupScene, doorLines, CURRENT_SCENE, atFeet, behindDoor, dialogPosition, distanceLine,
  needsLockSize, panelSplit, placementFor, sceneRefs, CREATURE_KINDS, buildView, makeRel, testPoints,
  GATHER_CHARS, LEGEND, SEES_CAP, classLabel, crText, itemText, itemsText, lightText, partyLine, renderGather,
  statsText, CODES, codedError, errorCode };
