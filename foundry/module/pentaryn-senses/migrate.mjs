// One-shot per world: clear the darkvision sight our retired sync stored on tokens (dnd5e 6).
//
// pentaryn-senses 0.3 wrote sight.visionMode "darkvision" and the sheet's range onto the prototype
// and placed tokens of every actor with Darkvision. dnd5e 6 derives token vision from the sheet
// itself (setting senseVisionSync, TokenDocument5e#_applySenseVision), but only ADDS to prepared
// data: a stored darkvision range would survive the sense going away (Goggles of Night taken).
// So, once per world, the active GM resets every stored darkvision sight to basic / range 0 and
// lets the native sync derive it from the sheet from then on.
//
// The pure half (planSightReset and friends) loads without Foundry; test/migrate.mjs proves it.

import { MODULE } from "./core/ids.mjs";

export { MODULE };
export const SIGHT_RESET = "sightReset";
/** The setting value once the reset has run in this world. */
export const SIGHT_RESET_DONE = 1;
/** What a reset sight is stored as; the native sync fills in range and mode from the sheet. */
export const RESET_SIGHT = Object.freeze({ visionMode: "basic", range: 0 });

/** True for a stored sight our old sync wrote: vision on and the darkvision mode. */
export function needsSightReset(sight) {
  return !!sight && sight.enabled === true && sight.visionMode === "darkvision";
}

/** True when the system is dnd5e 6 or later — the reset must never run on 5.x (no native sync). */
export function systemReady(id, version) {
  if (id !== "dnd5e") return false;
  const major = Number.parseInt(String(version ?? "").split(".")[0], 10);
  return Number.isFinite(major) && major >= 6;
}

/** The stored (source) sight of a token or prototype, never the sense-derived prepared one. */
function storedSight(doc) {
  try {
    const stored = doc?._source?.sight;
    if (stored) return stored;
  } catch { /* fall through to the document's own field */ }
  try {
    return doc?.sight ?? null;
  } catch {
    return null;
  }
}

/**
 * The updates the reset makes. `actors` are world actors ({ id, pack?, prototypeToken | _source });
 * `scenes` are { id, tokens: [{ id, sight | _source }] }. Returns
 * { actors: [{ _id, "prototypeToken.sight.visionMode", "prototypeToken.sight.range" }],
 *   scenes: [{ sceneId, updates: [{ _id, "sight.visionMode", "sight.range" }] }] }.
 * Only darkvision sights with vision enabled are touched.
 */
export function planSightReset(actors, scenes) {
  const plan = { actors: [], scenes: [] };
  for (const a of actors ?? []) {
    if (!a || a.pack) continue;
    const sight = a._source?.prototypeToken?.sight ?? a.prototypeToken?.sight;
    if (needsSightReset(sight)) plan.actors.push({
      _id: a.id,
      "prototypeToken.sight.visionMode": RESET_SIGHT.visionMode,
      "prototypeToken.sight.range": RESET_SIGHT.range
    });
  }
  for (const s of scenes ?? []) {
    if (!s) continue;
    const updates = [];
    for (const t of s.tokens ?? []) {
      if (t && needsSightReset(storedSight(t))) updates.push({
        _id: t.id, "sight.visionMode": RESET_SIGHT.visionMode, "sight.range": RESET_SIGHT.range
      });
    }
    if (updates.length) plan.scenes.push({ sceneId: s.id, updates });
  }
  return plan;
}

/* -------------------------------------------- */
/*  Foundry side                                */
/* -------------------------------------------- */

/** Registered on init (senses.mjs). */
export function registerSightReset() {
  game.settings.register(MODULE, SIGHT_RESET, {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
}

/**
 * Run the reset in this world if it is due. Active GM only, dnd5e 6+ only, and only while dnd5e's
 * senseVisionSync is on (with it off, a reset would leave every token blind). `force` runs it again
 * regardless of the setting. Returns { prototypes, tokens } written, or null when it did not run.
 */
export async function resetSight({ force = false } = {}) {
  if (!game.users.activeGM?.isSelf) return null;
  if (!systemReady(game.system?.id, game.system?.version)) return null;
  let native = false;
  try {
    native = game.settings.get("dnd5e", "senseVisionSync") === true;
  } catch { /* setting absent */ }
  if (!native) {
    console.warn(`${MODULE} | sight reset skipped: dnd5e senseVisionSync is off`);
    return null;
  }
  if (!force && (Number(game.settings.get(MODULE, SIGHT_RESET)) || 0) >= SIGHT_RESET_DONE) return null;

  const plan = planSightReset(game.actors, game.scenes);
  if (plan.actors.length) await Actor.implementation.updateDocuments(plan.actors);
  let tokens = 0;
  for (const { sceneId, updates } of plan.scenes) {
    const scene = game.scenes.get(sceneId);
    if (!scene) continue;
    await scene.updateEmbeddedDocuments("Token", updates);
    tokens += updates.length;
  }
  await game.settings.set(MODULE, SIGHT_RESET, SIGHT_RESET_DONE);
  const result = { prototypes: plan.actors.length, tokens };
  console.info(`${MODULE} | sight reset: ${result.prototypes} prototype(s), ${tokens} token(s) back to basic / 0`);
  return result;
}
