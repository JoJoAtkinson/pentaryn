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

test("analyze() on a Levels scene names js, the backend that ran, even when wasm is picked (senses-walls-cursors-2 follow-up)", async () => {
  const levelled = makeScene(F, { id: "sceneLevels0001", name: "Tower", walls: houseWalls().map(w => ({ ...w, levels: ["L1"] })) });
  const plain = levelled.walls.map(w => {
    const o = w.toObject();
    return { _id: w.id, c: o.c, door: o.door, sight: o.sight, move: o.move, light: o.light, sound: o.sound, dir: o.dir, levels: o.levels ?? [], flags: o.flags ?? {} };
  });
  assert.ok(plain.every(w => w.levels.length), "the fixture carries its levels through toObject()");
  const ref = runEngine(plain, { gridSize: 100, runId: "lv" });
  for (const backend of ["wasm", "auto"]) {
    await game.settings.set("pentaryn-walls", "backend", backend);
    const out = await withConsole(F, () => game.pentaryn.walls.analyze({ sceneId: levelled.id, runId: "lv" }));
    assert.equal(out.backend, "js", backend);
    for (const k of ["creates", "updates", "refusals", "log"]) assert.deepEqual(out[k], ref[k], `${backend} ${k}`);
  }
  const lvl = await withConsole(F, () => game.pentaryn.walls.analyze({ sceneId: levelled.id, backend: "wasm", runId: "lv" }));
  assert.equal(lvl.backend, "js", "an explicit backend override is passed over too");
  const flat = await withConsole(F, () => game.pentaryn.walls.analyze({ sceneId: scene.id, backend: "wasm", runId: "lv" }));
  assert.equal(flat.backend, "wasm", "a level-less scene stays on wasm");
  await game.settings.set("pentaryn-walls", "backend", "auto");
});

test("walls-EXT-1: a weldEps/pinEps override routes to js (the wasm ABI cannot take it), so the card names js and its tolerances are the ones that ran", async () => {
  const { get } = await import("../core/backends.mjs");
  const { runWasm } = await import("../backend-wasm.mjs");
  const wasm = get("wasm");
  const walls = plainWalls();
  assert.equal(wasm.accepts(walls, { gridSize: 100 }), true, "plain opts stay on wasm");
  assert.equal(wasm.accepts(walls, { gridSize: 100, weldEps: 3 }), false, "weldEps");
  assert.equal(wasm.accepts(walls, { gridSize: 100, pinEps: 2 }), false, "pinEps");
  for (const override of [{ weldEps: 3 }, { pinEps: 2 }]) {
    const ref = runEngine(walls, { gridSize: 100, runId: "ov", ...override });
    for (const backend of ["wasm", "auto"]) {
      await game.settings.set("pentaryn-walls", "backend", backend);
      const out = await withConsole(F, () => game.pentaryn.walls.analyze({ sceneId: scene.id, runId: "ov", ...override }));
      assert.equal(out.backend, "js", `${backend} ${JSON.stringify(override)}`);
      for (const k of ["creates", "updates", "refusals", "log", "report"]) assert.deepEqual(out[k], ref[k], `${backend} ${k}`);
    }
    const direct = runWasm(walls, { gridSize: 100, runId: "ov", ...override });
    assert.deepEqual(direct, ref, "a direct runWasm caller gets the js answer too");
  }
  await game.settings.set("pentaryn-walls", "backend", "auto");
});
