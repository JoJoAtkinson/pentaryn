/**
 * pentaryn-prompts core — the per-scene model cache behind the hover tip (prompts-lookup-8). PURE:
 * what a model is and when it goes stale are the callers' (scene-adapter builds and stores; the
 * cache feature bumps generations from INVALIDATION).
 *
 * Off until the cache feature turns it on — with nothing watching for changes, nothing is cached.
 * The side panel always builds fresh and stores what it built, so the next hover reuses it; gather
 * and api.model never touch it: what Claude is handed is always built fresh.
 */

/**
 * After any of these a scene's cached model is stale, and how much of the cache it drops:
 * "scene" — a placed document bumps its own scene (`doc.parent`); "self" — a scene bumps itself;
 * "world" — actors, items, folders and journals feed every scene's panel, so the whole cache drops;
 * "setting" — only core's grid-diagonal rule, which drops the whole cache.
 */
export const INVALIDATION = Object.freeze({
  createToken: "scene", updateToken: "scene", deleteToken: "scene",
  createWall: "scene", updateWall: "scene", deleteWall: "scene",
  createNote: "scene", updateNote: "scene", deleteNote: "scene",
  createAmbientLight: "scene", updateAmbientLight: "scene", deleteAmbientLight: "scene",
  createTile: "scene", updateTile: "scene", deleteTile: "scene",
  createRegion: "scene", updateRegion: "scene", deleteRegion: "scene",
  updateScene: "self", deleteScene: "self",
  updateActor: "world", deleteActor: "world",
  createItem: "world", updateItem: "world", deleteItem: "world",
  updateFolder: "world", updateJournalEntry: "world", updateJournalEntryPage: "world",
  updateSetting: "setting",
});

/** The hooks the cache feature registers: INVALIDATION's keys, in its order. */
export const INVALIDATING_HOOKS = Object.freeze(Object.keys(INVALIDATION));

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
