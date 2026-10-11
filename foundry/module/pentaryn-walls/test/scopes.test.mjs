// Stamps are read under both flag scopes (guide step 10, the read half of the Wave 7 flag-scope
// migration): the module id first, then the legacy "wall-autocomplete". Nothing writes the new
// scope yet, so every existing wall reads exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { READ_SCOPES, get, planUndo, runEngine, stampOf, wasmReady } from "./fixtures/engine.mjs";
import { FIXTURES } from "./fixtures/corpus.mjs";
import { makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";

const LEGACY = "wall-autocomplete", CURRENT = "pentaryn-walls";
const moved = w => {
  if (!w.flags?.[LEGACY]) return w;
  const { [LEGACY]: stamp, ...rest } = w.flags;
  return { ...w, flags: { ...rest, [CURRENT]: stamp } };
};

test("READ_SCOPES is newest first; stampOf merges with the newer scope winning", () => {
  assert.deepEqual(READ_SCOPES, [CURRENT, LEGACY]);
  assert.deepEqual(stampOf({}), {});
  assert.deepEqual(stampOf({ flags: { other: { run: "x" } } }), {});
  assert.deepEqual(stampOf({ flags: { [LEGACY]: { run: "a", rule: "X1" } } }), { run: "a", rule: "X1" });
  assert.deepEqual(stampOf({ flags: { [CURRENT]: { run: "b" } } }), { run: "b" });
  assert.deepEqual(stampOf({ flags: { [LEGACY]: { run: "a", rule: "X1" }, [CURRENT]: { run: "b" } } }), { run: "b", rule: "X1" });
});

test("the engine reads keepOpen from either scope (js and wasm)", async () => {
  await wasmReady;
  const w = (id, c, flags) => ({ _id: id, c, light: 20, move: 20, sight: 20, sound: 20, door: 0, ds: 0, dir: 0, levels: [], flags });
  const pair = flags => [w("a", [0, 0, 200, 0], flags), w("b", [300, 0, 500, 0])];
  for (const backend of ["js", "wasm"]) {
    const run = flags => get(backend).run(pair(flags), { gridSize: 100, runId: "s" }).creates.length;
    assert.equal(run(undefined), 1, `${backend}: the gap fills`);
    assert.equal(run({ [LEGACY]: { keepOpen: true } }), 0, `${backend}: legacy keepOpen holds it open`);
    assert.equal(run({ [CURRENT]: { keepOpen: true } }), 0, `${backend}: module-scope keepOpen holds it open`);
    assert.equal(run({ [LEGACY]: { keepOpen: true }, [CURRENT]: { keepOpen: false } }), 1, `${backend}: the newer scope wins`);
  }
});

test("planUndo answers the same before, after and across the migration", () => {
  const res = runEngine(FIXTURES[0].walls, { gridSize: 100, runId: "r1" });
  const walls = [...FIXTURES[0].walls.map(w => {
    const u = res.updates.find(x => x._id === w._id);
    return u ? { ...w, c: u.c, flags: u.flags } : w;
  }), ...res.creates.map((c, i) => ({ _id: `g${i}`, ...c }))];
  const before = planUndo(walls);
  assert.deepEqual(planUndo(walls.map(moved)), before);
  assert.deepEqual(planUndo(walls.map((w, i) => (i % 2 ? moved(w) : w))), before, "mixed scene");
});

test("glue: undo deletes the stamp in whichever scope the wall carries it", async () => {
  const F = await wallsWorld();
  await import("../pentaryn-walls.mjs");
  F.fire("init");
  F.fire("ready");
  await wasmReady;
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const scene = makeScene(F, { id: "sceneScopes0001", name: "M", walls: [
    { _id: "old", c: [0, 0, 50, 0], flags: { [LEGACY]: { run: "T", rule: "X1", priorC: [0, 0, 80, 0] } } },
    { _id: "new", c: [0, 9, 50, 9], flags: { [CURRENT]: { run: "T", rule: "X1", priorC: [0, 9, 80, 9] } } },
    { _id: "gen", c: [0, 20, 9, 20], flags: { [CURRENT]: { run: "T", generated: true } } },
  ] });
  const from = F.calls.length;
  const out = await withConsole(F, () => game.pentaryn.walls.undo({ sceneId: scene.id }));
  assert.deepEqual(out, { deleted: 1, restored: 2, run: "T" });
  const writes = F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op)).map(c => [c.op, c.data]);
  assert.deepEqual(writes, [
    ["updateEmbeddedDocuments", [
      { _id: "old", c: [0, 0, 80, 0], [`flags.${LEGACY}`]: "<_del>" },
      { _id: "new", c: [0, 9, 80, 9], [`flags.${CURRENT}`]: "<_del>" },
    ]],
    ["deleteEmbeddedDocuments", ["gen"]],
  ]);
});
