/**
 * prompts-core-EXT-1 [declared]: the cache's invalidation hooks and their scopes are one table,
 * core/cache.mjs INVALIDATION (hook → "scene" | "self" | "world" | "setting"); INVALIDATING_HOOKS is
 * its keys, and cache.mjs keeps no scope lists of its own. Deleting an actor now drops every scene's
 * cached model, as updating one already did.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("prompts-core-EXT-1: INVALIDATION is the one table; INVALIDATING_HOOKS is its keys", async () => {
  const { INVALIDATION, INVALIDATING_HOOKS } = await import("../core/cache.mjs");
  assert.ok(Object.isFrozen(INVALIDATION));
  assert.deepEqual([...INVALIDATING_HOOKS], Object.keys(INVALIDATION));
  for (const scope of Object.values(INVALIDATION)) assert.ok(["scene", "self", "world", "setting"].includes(scope), scope);
  assert.equal(INVALIDATION.deleteActor, "world");
  assert.equal(INVALIDATION.updateActor, "world");
  assert.equal(INVALIDATION.updateScene, "self");
  assert.equal(INVALIDATION.deleteScene, "self");
  assert.equal(INVALIDATION.createToken, "scene");
  assert.equal(INVALIDATION.updateSetting, "setting");
});

test("prompts-core-EXT-1: cache.mjs keeps no hook or scope list of its own", () => {
  const src = readFileSync(new URL("../cache.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /new Set\(/);
  assert.doesNotMatch(src, /"updateActor"|"updateScene"/);
});

test("prompts-core-EXT-1: wired — deleting an actor drops every scene's cached model", async () => {
  const { installWorld, captureConsole } = await import("./fixtures/world.mjs");
  const F = await installWorld();
  await captureConsole(() => import("../prompts.mjs"));
  const { sceneCache } = await import("../core/cache.mjs");
  const { seesCount } = await import("../scene-adapter.mjs");
  F.fire("init");
  await captureConsole(() => F.fire("setup"));
  await captureConsole(async () => { F.fire("ready"); await new Promise(r => setImmediate(r)); });
  assert.equal(sceneCache.enabled, true);
  seesCount(F.s1.tokens.get("m1"));
  assert.equal(sceneCache.size, 1);
  F.fire("deleteActor", F.game.actors.get("markerActormid00"), {});
  assert.equal(sceneCache.size, 0);
  F.game.pentaryn.prompts.uninstall();
});
