/**
 * Pentaryn Senses (pentaryn-senses) — PURE core barrel: the module's constants and every pure helper,
 * so glue and tests import one path. No Foundry global at runtime: node imports this file bare.
 *
 * The helpers are imported and then exported by name (not `export … from`), so the import-graph
 * tools see each file and this list is the core's whole surface.
 */

import { FLAGS } from "./core/ids.mjs";
import { esc, unsetPath } from "./core/util.mjs";
import { MODULE, CHAIN_FLAG, readChain, chainPairs, linksTouching, chainGeometry, chainThickness } from "./chain-core.mjs";
import {
  DARK, SPELL_LIGHT, LIGHT_PROFILES, PHB_LIGHT_ACTOR, TORCH_ACTIVITY_ID, slug, profileKey, profileFor, lightFor, strongest,
  carriedLightOf, lightingItemId, isLit, isHooded, isLightSpellData, isLightToggle, readSpellCast, castFlag, readSpellLight,
  planSpellLight, spellLightUpdate, restoredLight, sourcesUnder, isPHBLightActorSource, torchActivityData,
} from "./light-core.mjs";
import { SIGHT_RESET, SIGHT_RESET_DONE, RESET_SIGHT, needsSightReset, systemReady, planSightReset } from "./migrate.mjs";

export {
  FLAGS, esc, unsetPath,
  MODULE, CHAIN_FLAG, readChain, chainPairs, linksTouching, chainGeometry, chainThickness,
  DARK, SPELL_LIGHT, LIGHT_PROFILES, PHB_LIGHT_ACTOR, TORCH_ACTIVITY_ID, slug, profileKey, profileFor, lightFor, strongest,
  carriedLightOf, lightingItemId, isLit, isHooded, isLightSpellData, isLightToggle, readSpellCast, castFlag, readSpellLight,
  planSpellLight, spellLightUpdate, restoredLight, sourcesUnder, isPHBLightActorSource, torchActivityData,
  SIGHT_RESET, SIGHT_RESET_DONE, RESET_SIGHT, needsSightReset, systemReady, planSightReset,
};

export const SHORT = "senses";
export const NS = "senses";
export const VERSION = "0.4.1";                       // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-senses/api@1";      // bump the major on a published-shape change
export const I18N = "PENTARYN_SENSES";
export const CSS = "ps-";

/** Events this module emits: none. */
export const HOOKS = Object.freeze({});
