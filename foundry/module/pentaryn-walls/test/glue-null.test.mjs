// walls-rob-5: preview/run/analyze/undo(null) mean the defaults, the same as calling with no
// argument — not a destructuring TypeError.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wasmReady } from "./fixtures/engine.mjs";
import { houseWalls, makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";

const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
F.fire("init");
F.fire("ready");
await wasmReady;
for (let i = 0; i < 20; i++) await Promise.resolve();
const scene = makeScene(F, { id: "sceneNullArg01", name: "Null", walls: houseWalls() });
canvas.scene = scene;
await game.settings.set("pentaryn-walls", "backend", "js");

// The run stamp is the clock (one per call) and ms the timing; everything else must match.
const omit = ({ ms, ...rest }) => JSON.parse(JSON.stringify(rest).replace(/\d{4}-\d\d-\d\dT[\d:.,]+Z/g, "T"));

test("walls-rob-5: analyze(null) is analyze()", async () => {
  const a = await withConsole(F, () => game.pentaryn.walls.analyze(null));
  const b = await withConsole(F, () => game.pentaryn.walls.analyze());
  assert.equal(a.sceneId, scene.id);
  assert.deepEqual(omit(a), omit(b));
});

test("walls-rob-5: preview(null) is preview()", async () => {
  const a = await withConsole(F, () => game.pentaryn.walls.preview(null));
  const b = await withConsole(F, () => game.pentaryn.walls.preview());
  assert.deepEqual(omit(a), omit(b));
});

test("walls-rob-5: run(null) writes the viewed scene, as run() does", async () => {
  const from = F.calls.length;
  const ran = await withConsole(F, () => game.pentaryn.walls.run(null));
  assert.ok(ran.creates.length, "the house fixture has gaps to close");
  const ops = F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op)).map(c => c.op);
  assert.deepEqual(ops, ["updateEmbeddedDocuments", "createEmbeddedDocuments"]);
});

test("walls-rob-5: undo(null) undoes the viewed scene's latest run, as undo() does", async () => {
  const stamped = makeScene(F, { id: "sceneNullUndo1", name: "Stamped", walls: [
    { _id: "a", c: [0, 0, 100, 0], flags: { "wall-autocomplete": { run: "2026-01-01T00:00:00Z", generated: true } } },
  ] });
  canvas.scene = stamped;
  try {
    const out = await withConsole(F, () => game.pentaryn.walls.undo(null));
    assert.deepEqual(out, { deleted: 1, restored: 0, run: "2026-01-01T00:00:00Z" });
  } finally { canvas.scene = scene; }
});
