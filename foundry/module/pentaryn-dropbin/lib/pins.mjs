// pentaryn kit 1.2.0 · vendored from foundry/lib/pins.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Which journals a scene Note pins (journal-EXT-9). One null-safe rule for journal (the one-page
 * look of an eye readable) and dropbin (hiding pinned readables from the players' sidebar); before
 * 1.2.0 each module kept its own copy and dropbin's threw on a scene without notes.
 *
 * A caller that caches the answer forgets it on every hook in `PIN_HOOKS` for which `pinsChanged`
 * is true: a Note created, updated or deleted, a Scene created or deleted, and a Scene update whose
 * change touches `notes` (re-pointing a pin through `scene.update({notes})`).
 */

/** Every journal id some scene Note pins. Missing scenes, scenes without notes and null notes are skipped. */
export function pinnedEntryIds(scenes) {
  const ids = new Set();
  for (const sc of scenes ?? []) for (const n of sc?.notes ?? []) if (n?.entryId) ids.add(n.entryId);
  return ids;
}

/** pinnedEntryIds(getScenes()), built on first use and kept until invalidate(). */
export function makePinnedCache(getScenes) {
  let ids = null;
  return {
    has: id => (ids ??= pinnedEntryIds(getScenes())).has(id),
    invalidate() { ids = null; },
    get built() { return ids !== null; },
  };
}

/** The six hooks that can change which journals are pinned (updateScene: see pinsChanged). */
export const PIN_HOOKS = Object.freeze(["createNote", "updateNote", "deleteNote", "createScene", "deleteScene", "updateScene"]);

/** Whether hook `name`, whose second argument is `changed`, can have changed the pins: updateScene only when it touches `notes`. */
export const pinsChanged = (name, changed) =>
  name !== "updateScene" || (changed !== null && typeof changed === "object" && "notes" in changed);
