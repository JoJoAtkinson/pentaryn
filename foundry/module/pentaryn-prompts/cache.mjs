/**
 * pentaryn-prompts — FEATURE: keeps the shared scene-model cache honest ([declared] DP8,
 * prompts-lookup-8). Every INVALIDATING_HOOKS change bumps the scene it touched, or drops the whole
 * cache when it feeds every scene (an actor, an item, a folder, a journal, core's diagonal rule).
 *
 * Installed at `ready` (the entry's late features): until then the cache is off (nothing cached), and
 * the import-time hook manifest (golden/hooks.json) stays as it was.
 */

import { INVALIDATING_HOOKS, sceneCache } from "./core/cache.mjs";

const SCENE_SELF = new Set(["updateScene", "deleteScene"]);
const WORLD_WIDE = new Set(["updateActor", "createItem", "updateItem", "deleteItem", "updateFolder", "updateJournalEntry", "updateJournalEntryPage"]);

function invalidate(hook, doc) {
  if (hook === "updateSetting") {
    if (doc?.key === "core.gridDiagonals") sceneCache.bumpAll();
    return;
  }
  if (WORLD_WIDE.has(hook)) return sceneCache.bumpAll();
  const sceneId = SCENE_SELF.has(hook) ? doc?.id : doc?.parent?.id;
  if (sceneId) sceneCache.bump(sceneId);
}

export function install(reg) {
  sceneCache.enabled = true;
  for (const hook of INVALIDATING_HOOKS) {
    reg.on(hook, doc => invalidate(hook, doc), { guard: false, label: `${hook}: scene-model cache` });
  }
}

export function uninstall() {
  sceneCache.enabled = false;
  sceneCache.bumpAll();
}
