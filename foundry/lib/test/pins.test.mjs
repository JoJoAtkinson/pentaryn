// journal-EXT-9: which journals a scene Note pins — one null-safe rule for journal and dropbin, the
// cache journal's bar keeps, and the six hooks that invalidate it (updateScene only when it changes notes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PIN_HOOKS, makePinnedCache, pinnedEntryIds, pinsChanged } from "../pins.mjs";

test("journal-EXT-9: pinnedEntryIds is null-safe (missing scenes, a null scene, a scene without notes, a null note)", () => {
  const scenes = [{ notes: [{ entryId: "a" }, { entryId: null }, { entryId: "" }, null] }, null, {}, { notes: null }, { notes: [{ entryId: "b" }] }];
  assert.deepEqual([...pinnedEntryIds(scenes)].sort(), ["a", "b"]);
  assert.deepEqual([...pinnedEntryIds(undefined)], []);
  assert.deepEqual([...pinnedEntryIds(null)], []);
});

test("journal-EXT-9: makePinnedCache builds on first use and rebuilds only after invalidate()", () => {
  const scenes = [{ notes: [{ entryId: "a" }] }];
  let builds = 0;
  const cache = makePinnedCache(() => { builds++; return scenes; });
  assert.equal(cache.built, false);
  assert.equal(cache.has("a"), true);
  scenes[0].notes.push({ entryId: "b" });
  assert.equal(cache.has("b"), false, "stale until invalidated");
  assert.equal(builds, 1);
  cache.invalidate();
  assert.equal(cache.built, false);
  assert.equal(cache.has("b"), true);
  assert.equal(builds, 2);
});

test("journal-EXT-9: the six invalidation hooks; updateScene counts only when its change touches notes", () => {
  assert.deepEqual([...PIN_HOOKS], ["createNote", "updateNote", "deleteNote", "createScene", "deleteScene", "updateScene"]);
  assert.ok(Object.isFrozen(PIN_HOOKS));
  for (const h of ["createNote", "updateNote", "deleteNote", "createScene", "deleteScene"]) assert.equal(pinsChanged(h, {}), true, h);
  assert.equal(pinsChanged("updateScene", { notes: [] }), true);
  assert.equal(pinsChanged("updateScene", { darkness: 0.5 }), false);
  assert.equal(pinsChanged("updateScene", undefined), false);
  assert.equal(pinsChanged("updateScene", null), false);
});
