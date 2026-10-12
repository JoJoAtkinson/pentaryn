/**
 * pentaryn-prompts core — the per-scene model cache behind the hover tip (prompts-lookup-8). PURE:
 * what a model is and when it goes stale are the callers' (scene-adapter builds and stores; the
 * cache feature bumps generations from INVALIDATING_HOOKS).
 *
 * Off until the cache feature turns it on — with nothing watching for changes, nothing is cached.
 * The side panel always builds fresh and stores what it built, so the next hover reuses it; gather
 * and api.model never touch it: what Claude is handed is always built fresh.
 */

/**
 * After any of these a scene's cached model is stale. Placed documents bump their own scene; a
 * scene update bumps itself; actors, items, folders, journals and core's grid-diagonal rule feed
 * every scene's panel, so they drop the whole cache.
 */
export const INVALIDATING_HOOKS = Object.freeze([
  "createToken", "updateToken", "deleteToken",
  "createWall", "updateWall", "deleteWall",
  "createNote", "updateNote", "deleteNote",
  "createAmbientLight", "updateAmbientLight", "deleteAmbientLight",
  "createTile", "updateTile", "deleteTile",
  "createRegion", "updateRegion", "deleteRegion",
  "updateScene", "deleteScene",
  "updateActor", "createItem", "updateItem", "deleteItem",
  "updateFolder", "updateJournalEntry", "updateJournalEntryPage",
  "updateSetting",
]);

const keyOf = (sceneId, opts) => `${sceneId}\u0000${JSON.stringify(opts ?? {})}`;

export class ModelCache {
  #gen = new Map();
  #entries = new Map();
  /** Set by the cache feature while its invalidation hooks are registered. */
  enabled = false;

  /** The cached model for (scene, opts) while its generation is unchanged; else `build()` (stored). */
  get(sceneId, opts, build) {
    if (!this.enabled) return build();
    const gen = this.#gen.get(sceneId) ?? 0;
    const hit = this.#entries.get(keyOf(sceneId, opts));
    if (hit && hit.gen === gen) return hit.model;
    return this.put(sceneId, opts, build());
  }

  /** Store a model built fresh (the side panel's), current as of now. → the model. */
  put(sceneId, opts, model) {
    if (this.enabled) this.#entries.set(keyOf(sceneId, opts), { sceneId, gen: this.#gen.get(sceneId) ?? 0, model });
    return model;
  }

  /** One scene changed: its models are rebuilt on next use (and released now). */
  bump(sceneId) {
    this.#gen.set(sceneId, (this.#gen.get(sceneId) ?? 0) + 1);
    for (const [k, e] of this.#entries) if (e.sceneId === sceneId) this.#entries.delete(k);
  }

  /** Something every scene reads changed (an actor, a folder, a journal page): drop everything. */
  bumpAll() {
    for (const e of this.#entries.values()) this.#gen.set(e.sceneId, (this.#gen.get(e.sceneId) ?? 0) + 1);
    this.#entries.clear();
  }

  get size() {
    return this.#entries.size;
  }
}

/** The one cache (scene-adapter reads it, the cache feature invalidates it). */
export const sceneCache = new ModelCache();
