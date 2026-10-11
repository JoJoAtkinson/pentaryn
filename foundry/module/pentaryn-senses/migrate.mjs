// One-shot per world: clear the darkvision sight our retired sync stored on tokens (dnd5e 6) —
// the Foundry half, gated by the world setting pentaryn-senses.sightReset. The pure half (planSightReset and friends) is core/migrate.mjs; the story of
// why the reset exists is in that file's header.

import { MODULE, SIGHT_RESET, SIGHT_RESET_DONE, planSightReset, systemReady } from "./senses-core.mjs";
import { setSetting, setting, systemSetting } from "./settings.mjs";

/**
 * Run the reset in this world if it is due. Active GM only, dnd5e 6+ only, and only while dnd5e's
 * senseVisionSync is on (with it off, a reset would leave every token blind). `force` runs it again
 * regardless of the setting. Returns { prototypes, tokens } written, or null when it did not run.
 */
export async function resetSight({ force = false } = {}) {
  if (!game.users.activeGM?.isSelf) return null;
  if (!systemReady(game.system?.id, game.system?.version)) return null;
  const native = systemSetting("dnd5e", "senseVisionSync") === true;   // undefined when absent
  if (!native) {
    console.warn(`${MODULE} | sight reset skipped: dnd5e senseVisionSync is off`);
    return null;
  }
  if (!force && (Number(setting(SIGHT_RESET)) || 0) >= SIGHT_RESET_DONE) return null;

  const plan = planSightReset(game.actors, game.scenes);
  if (plan.actors.length) await Actor.implementation.updateDocuments(plan.actors);
  let tokens = 0;
  for (const { sceneId, updates } of plan.scenes) {
    const scene = game.scenes.get(sceneId);
    if (!scene) continue;
    await scene.updateEmbeddedDocuments("Token", updates);
    tokens += updates.length;
  }
  await setSetting(SIGHT_RESET, SIGHT_RESET_DONE);
  const result = { prototypes: plan.actors.length, tokens };
  console.info(`${MODULE} | sight reset: ${result.prototypes} prototype(s), ${tokens} token(s) back to basic / 0`);
  return result;
}
