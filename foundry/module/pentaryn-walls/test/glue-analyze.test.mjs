// Step 8e (senses-walls-cursors-33): analyze() is preview() without any side effect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runEngine, wasmReady } from "./fixtures/engine.mjs";
import { houseWalls, makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";

const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
F.fire("init");
F.fire("ready");
await wasmReady;
for (let i = 0; i < 20; i++) await Promise.resolve();
const scene = makeScene(F, { id: "sceneAnalyze001", name: "Hall", walls: houseWalls() });
canvas.scene = scene;
const plainWalls = () => scene.walls.map(w => {
  const o = w.toObject();
  return { _id: w.id, c: o.c, door: o.door, sight: o.sight, move: o.move, light: o.light, sound: o.sound, dir: o.dir, levels: o.levels ?? [], flags: o.flags ?? {} };
});

test("analyze(): no chat, no ping, no console, no writes; the js engine's own answer plus scene/backend/ms", async () => {
  await game.settings.set("pentaryn-walls", "backend", "js");
  const from = F.calls.length;
  const out = await withConsole(F, () => game.pentaryn.walls.analyze({ runId: "a1" }));
  const effects = F.calls.slice(from).filter(c => c.op !== "settings.set");
  assert.deepEqual(effects, []);
  const ref = runEngine(plainWalls(), { gridSize: 100, runId: "a1" });
  for (const k of ["creates", "updates", "refusals", "lints", "log", "report"]) assert.deepEqual(out[k], ref[k], k);
  assert.equal(out.sceneId, scene.id);
  assert.equal(out.sceneName, "Hall");
  assert.equal(out.backend, "js");
  assert.equal(typeof out.ms, "number");
});

test("analyze() takes sceneId and a backend override, and is not blocked by the run lock", async () => {
  await game.settings.set("pentaryn-walls", "backend", "auto");
  let release;
  F.hold.updateEmbeddedDocuments = new Promise(r => { release = r; });
  await withConsole(F, async () => {
    const running = game.pentaryn.walls.run({ runId: "r" });
    const out = await game.pentaryn.walls.analyze({ sceneId: scene.id, backend: "wasm" });
    assert.equal(out.backend, "wasm");
    delete F.hold.updateEmbeddedDocuments;
    release();
    await running;
  });
});
