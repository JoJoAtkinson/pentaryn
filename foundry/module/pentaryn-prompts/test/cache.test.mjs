/**
 * The scene-model cache ([declared] DP8, prompts-lookup-8): the pure cache with an injected
 * builder, the invalidating hooks as a literal, and the wiring — off until ready installs the
 * cache feature; then the hover tip's count reuses the model until a change on that scene.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ModelCache, INVALIDATING_HOOKS } from "../core/cache.mjs";

test("ModelCache: one build per generation, per scene, per opts; bump, bumpAll, put; off = always build", () => {
  const c = new ModelCache();
  let built = 0;
  const b = () => ({ n: ++built });
  assert.equal(c.get("s1", {}, b).n, 1);
  assert.equal(c.get("s1", {}, b).n, 2, "off: never cached");
  c.enabled = true;
  assert.equal(c.get("s1", {}, b).n, 3);
  assert.equal(c.get("s1", {}, b).n, 3);
  assert.equal(c.get("s2", {}, b).n, 4);
  assert.equal(c.get("s1", { builtWithoutProvenance: true }, b).n, 5, "differing opts: their own entry");
  c.bump("s1");
  assert.equal(c.get("s1", {}, b).n, 6);
  assert.equal(c.get("s2", {}, b).n, 4, "s2 untouched by s1's bump");
  const fresh = { n: 99 };
  assert.equal(c.put("s2", {}, fresh), fresh);
  assert.equal(c.get("s2", {}, b), fresh);
  c.bumpAll();
  assert.equal(c.size, 0);
  assert.equal(c.get("s2", {}, b).n, 7);
});

test("INVALIDATING_HOOKS, pinned", () => {
  assert.deepEqual(INVALIDATING_HOOKS, ["createToken", "updateToken", "deleteToken", "createWall", "updateWall", "deleteWall",
    "createNote", "updateNote", "deleteNote", "createAmbientLight", "updateAmbientLight", "deleteAmbientLight",
    "createTile", "updateTile", "deleteTile", "createRegion", "updateRegion", "deleteRegion", "updateScene", "deleteScene",
    "updateActor", "createItem", "updateItem", "deleteItem", "updateFolder", "updateJournalEntry", "updateJournalEntryPage",
    "updateSetting"]);
});

test("wired: off before ready; after ready the hover count reuses the model until the scene changes", async () => {
  const { installWorld, captureConsole, MODULE } = await import("./fixtures/world.mjs");
  const F = await installWorld();
  await captureConsole(() => import("../prompts.mjs"));
  const { sceneCache } = await import("../core/cache.mjs");
  const { seesCount } = await import("../scene-adapter.mjs");
  F.fire("init");
  await captureConsole(() => F.fire("setup"));
  const m1 = F.s1.tokens.get("m1");
  assert.equal(sceneCache.enabled, false);
  seesCount(m1);
  assert.equal(sceneCache.size, 0, "nothing cached before ready");
  await captureConsole(async () => { F.fire("ready"); await new Promise(r => setImmediate(r)); });
  assert.equal(sceneCache.enabled, true);
  const before = seesCount(m1);
  assert.equal(sceneCache.size, 1);
  // a change the cache does not watch (a wall array swapped by hand): the cached count stands
  const walls = F.s1.walls;
  F.s1.walls = [];
  assert.equal(seesCount(m1), before);
  F.s1.walls = walls;
  // a token created next to it: createToken bumps s1, the count is rebuilt and grows
  const [near] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActortiny0", x: 300, y: 200, flags: { [MODULE]: { prompt: "a rat" } } }], { pentarynPrompts: { t: 1 } });
  assert.equal(seesCount(m1), before + 1);
  await F.s1.deleteEmbeddedDocuments("Token", [near.id]);
  assert.equal(seesCount(m1), before);
  // an actor update drops every scene's model
  F.fire("updateActor", F.game.actors.get("markerActormid00"), {});
  assert.equal(sceneCache.size, 0);
  // uninstall turns it off
  F.game.pentaryn.prompts.uninstall();
  assert.equal(sceneCache.enabled, false);
});
