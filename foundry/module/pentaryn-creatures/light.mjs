/**
 * Pentaryn Creatures — FEATURE: the creature light. Every token a player owns whose actor is a
 * creature (`npc`: summons, familiars, skeletons, Arcane Eye, a steed) carries a small bright light,
 * so it never vanishes in the dark. Never on a PC or its Wild Shape form. The decision per token is
 * core's lightUpdate; this file decides when to run it and writes the result.
 *
 * Who writes: the active GM's client only (isActiveGM, no fallback: lights wait until a GM
 * connects). Every change is queued per scene and flushed at most 200 ms after the first one, in
 * one updateEmbeddedDocuments per scene.
 */

import { isPlayerCreature, lightUpdate, makeCoalescer, shouldQueueLight } from "./creatures-core.mjs";
import { setting } from "./settings.mjs";
import { summarize } from "./tokens-adapter.mjs";
import { isActiveGM } from "./lib/election.mjs";

/** The module's kit logger (ctx.log); every line keeps the `pentaryn-creatures | ` prefix. */
let log = null;

const queued = new Map();   // sceneId -> Set<tokenId> | "all"
/**
 * One flush at most 200 ms after the first queued change, never pushed back by later ones: other
 * modules write token flags constantly in combat, and a debounce let that traffic postpone a
 * summon's light indefinitely (transform-creatures-26). Everything queued in the window flushes
 * together. The timers are read at call time (tests mock them).
 */
const flusher = makeCoalescer(200, () => flush(), {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
  mode: "window",
});

function queue(scene, tokenId = null) {
  if (!scene || !isActiveGM()) return;
  const cur = queued.get(scene.id);
  if (tokenId === null || cur === "all") queued.set(scene.id, "all");
  else (cur ?? queued.set(scene.id, new Set()).get(scene.id)).add(tokenId);
  flusher.arm();
}

async function flush() {
  const jobs = [...queued.entries()];
  queued.clear();
  for (const [sceneId, ids] of jobs) {
    const scene = game.scenes.get(sceneId);
    if (scene) await syncScene(scene, ids === "all" ? null : ids).catch(err => log.warn(`light sync failed on ${scene.name}`, err));
  }
}

/** Bring one scene's tokens in line (or only `ids`, a Set). Returns how many tokens were written. */
export async function syncScene(scene, ids = null) {
  if (!isActiveGM()) return 0;
  const radius = Number(setting("lightRadius")) || 0;
  const updates = [];
  for (const t of scene.tokens) {
    if (ids && !ids.has(t.id)) continue;
    const u = lightUpdate(t, { qualifies: isPlayerCreature(summarize(t)), radius });
    if (u) updates.push({ _id: t.id, ...u });
  }
  // the option marks the write as ours, so our own updateToken hook does not queue it again
  if (updates.length) await scene.updateEmbeddedDocuments("Token", updates, { pentarynCreatures: true });
  return updates.length;
}

/** Every scene, in order. Returns how many tokens were written. */
export async function syncAll() {
  let n = 0;
  for (const scene of game.scenes) n += await syncScene(scene);
  return n;
}

/** Re-check every scene in the background; a failure is one console line. */
export function syncAllQuietly() {
  if (isActiveGM()) syncAll().catch(err => log.warn("light sync failed", err));
}

/**
 * Hooks in the module's historic order. None had a try/catch of its own, so none is guarded: a
 * throw still reaches Foundry's hook error handling as before.
 */
export function install(reg, ctx) {
  log = ctx.log;
  reg.on("createToken", (doc) => queue(doc.parent, doc.id), { guard: false, label: "createToken: queue light" });
  reg.on("updateToken", (doc, changes, options) => {
    if (shouldQueueLight(changes, options)) queue(doc.parent, doc.id);
  }, { guard: false, label: "updateToken: queue light" });
  reg.on("updateActor", (actor, changes) => {
    if (!isActiveGM() || !changes || !("ownership" in changes || "type" in changes)) return;
    if (actor.isToken) return queue(actor.token?.parent, actor.token?.id);
    for (const scene of game.scenes) for (const t of scene.tokens) if (t.actorId === actor.id) queue(scene, t.id);
  }, { guard: false, label: "updateActor: queue light" });
  // A user promoted to GM, or removed, changes who counts as a player owner.
  for (const h of ["createUser", "updateUser", "deleteUser"]) {
    reg.on(h, (_user, changes) => {
      if (h === "updateUser" && !("role" in (changes ?? {}))) return;
      if (isActiveGM()) for (const scene of game.scenes) queue(scene);
    }, { guard: false, label: `${h}: re-check every scene` });
  }
  ctx.onSettingChange("lightRadius", () => syncAllQuietly());
  ctx.expose({ syncScene, syncAll, syncAllQuietly });
}

/** Drop the queue and its timer (the hooks are the registry's to remove). */
export function uninstall() {
  queued.clear();
  flusher.cancel();
}
