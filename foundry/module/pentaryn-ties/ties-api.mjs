/**
 * COMPAT BARREL (one release; until: pentaryn-ties 1.0). The ties data layer moved to
 * ties-adapter.mjs and the pure constants and clamps to ties-core.mjs in the blueprint migration
 * (S3, S8); `mayWrite` lives in settings.mjs. Every name this file has always exported is
 * re-exported here, so in-module importers and console macros that import it keep working
 * (test/golden/ties-api-exports.json pins the list).
 */

export {
  MODULE,
  FLAG,
  LEGACY_SCOPE,
  STANCES,
  STRENGTHS,
  NOTES_MAX,
  WORD_MAX,
  clampStance,
  clampStrength,
  clampNotes,
  clampWord,
  stanceOf
} from "./ties-core.mjs";
export {
  stanceLabel,
  baseActorOf,
  presentActorIds,
  read,
  inbound,
  write,
  setTie,
  setNotes,
  removeTie,
  candidates,
  migrateLegacy,
  canReach
} from "./ties-adapter.mjs";
export { mayWrite } from "./settings.mjs";
