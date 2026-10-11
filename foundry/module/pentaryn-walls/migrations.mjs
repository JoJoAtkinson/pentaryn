/**
 * Wall autocomplete — the flag-scope data migration, glue half (blueprint B6, guide step 10).
 *
 * FEATURE, DORMANT. `install()` only exposes `migrateFlagScope` on ctx.exposed; nothing calls it
 * and no API row publishes it. The Wave 7 restart batch wires it, together with module.json
 * (`flagScope: "pentaryn-walls"`), the hidden `migrationVersion` store row, and FLAG_SCOPE moving
 * to the module id — see context/plans/addon-blueprint-2026-10/migrate-pentaryn-walls.md §Result.
 *
 * The run: GM only; version-keyed (skipped once the store says MIGRATION_VERSION); one
 * `updateEmbeddedDocuments("Wall", …)` batch per scene that has legacy stamps; idempotent (a
 * second run plans nothing, and two GM tabs send identical updates).
 */

import {MIGRATION_VERSION, planScopeMigration} from "./walls-core.mjs";

/**
 * @param {{scenes?: Iterable, version: {get: () => number|Promise<number>, set: (v: number) => *},
 *   del?: *, dryRun?: boolean, log?: object}} opts
 *   version: the store row (injected; the Wave 7 batch passes the migrationVersion setting)
 * @returns {Promise<{ok: boolean, skipped?: string, from?: number, to?: number, dryRun?: boolean,
 *   scenes: {sceneId: string, walls: number}[], walls: number}>}
 */
export async function migrateFlagScope({scenes = game.scenes, version, del = globalThis._del, dryRun = false, log = null} = {}) {
  if (game.user?.isGM !== true) return {ok: false, skipped: "not a GM", scenes: [], walls: 0};
  const from = Number(await version.get()) || 0;
  if (from >= MIGRATION_VERSION) return {ok: true, skipped: "already applied", from, scenes: [], walls: 0};

  const done = [];
  for (const scene of scenes) {
    const updates = planScopeMigration(scene.walls.map(w => ({...w.toObject(), _id: w.id})), {del});
    if (!updates.length) continue;
    // One batch per scene: a scene is the unit Foundry writes walls in.
    if (!dryRun) await scene.updateEmbeddedDocuments("Wall", updates);
    done.push({sceneId: scene.id, walls: updates.length});
  }
  const walls = done.reduce((n, s) => n + s.walls, 0);
  if (!dryRun) await version.set(MIGRATION_VERSION);
  log?.info?.("flag-scope migration", {from, to: MIGRATION_VERSION, dryRun, scenes: done.length, walls, by: game.user.id});
  return {ok: true, from, to: MIGRATION_VERSION, dryRun, scenes: done, walls};
}

export function install(reg, ctx) {
  ctx.expose({migrateFlagScope});
}

export function uninstall() {}
