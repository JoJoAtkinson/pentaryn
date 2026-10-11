// status({ sceneId }) (finding -23): answers for any scene, not only the viewed one, and names every
// setting key with its scope. The historic eight keys stay first (the frozen glue test's prefix).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { OTHER, SCENE, combat, movementWorld } from "./fixtures/world.mjs";
import { VERSION } from "../movement-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.movement;

test("appended keys: sceneId, version, settings (key → scope), after the historic eight", () => {
  const s = api.status();
  assert.deepEqual(Object.keys(s), ["policy", "combatOnScene", "allowed", "reason", "wish", "ghost", "ownedOnTop",
    "patched", "sceneId", "version", "settings"]);
  assert.equal(s.sceneId, SCENE);
  assert.equal(s.version, VERSION);
  assert.deepEqual(s.settings, { ghostPolicy: "world", ghostPolicyLast: "world", ghost: "client", ownedOnTop: "client" });
});

test("opts.sceneId asks about another scene; the default is the viewed scene", () => {
  game.combats.contents = [combat({ sceneId: OTHER })];
  assert.equal(api.status().combatOnScene, false);
  const other = api.status({ sceneId: OTHER });
  assert.equal(other.combatOnScene, true);
  assert.equal(other.reason, "combat");
  assert.equal(other.sceneId, OTHER);
  assert.equal(api.status({}).sceneId, SCENE);
  assert.equal(api.status(null).sceneId, SCENE);
  game.combats.contents = [];
});

test("no viewed scene and no sceneId: sceneId null, no combat", () => {
  const saved = canvas.scene;
  canvas.scene = null;
  game.combats.contents = [combat()];
  const s = api.status();
  assert.equal(s.sceneId, null);
  assert.equal(s.combatOnScene, false);
  canvas.scene = saved;
  game.combats.contents = [];
});
