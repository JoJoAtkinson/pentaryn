// walls-rob-7: a sceneId that names no scene says so — it does not get the "open one, or pass a
// sceneId" advice meant for a call with no sceneId and no viewed scene.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wasmReady } from "./fixtures/engine.mjs";
import { houseWalls, makeScene, wallsWorld } from "./fixtures/world.mjs";

const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
F.fire("init");
F.fire("ready");
await wasmReady;
for (let i = 0; i < 20; i++) await Promise.resolve();
const scene = makeScene(F, { id: "sceneUnknown01", name: "Viewed", walls: houseWalls() });
canvas.scene = scene;
await game.settings.set("pentaryn-walls", "backend", "js");

const unknown = { message: 'pentaryn-walls: no scene with id "noSuchScene0000".' };

for (const action of ["preview", "run", "analyze", "undo"]) {
  test(`walls-rob-7: ${action}({sceneId}) with an unknown id names the id`, async () => {
    await assert.rejects(game.pentaryn.walls[action]({ sceneId: "noSuchScene0000" }), unknown);
  });
}

test("walls-rob-7: no sceneId and no viewed scene keeps the open-one message", async () => {
  canvas.scene = null;
  try {
    await assert.rejects(game.pentaryn.walls.preview(),
      { message: "pentaryn-walls: no scene — open one, or pass a sceneId." });
  } finally { canvas.scene = scene; }
});
