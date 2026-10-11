// Step 8a (senses-walls-cursors-1): planUndo, the pure undo selection, against the legacy oracle
// (today's getFlag logic ported over plain objects) and a round trip through a real run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planUndo, runEngine } from "../walls-core.mjs";
import { FIXTURES } from "./fixtures/corpus.mjs";
import { applied } from "./fixtures/runner.mjs";
import { legacyPlan, UNDO_WALLS } from "./fixtures/legacy-undo.mjs";
import { makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";
import { wasmReady } from "./fixtures/engine.mjs";

/** The legacy plan with its `-=` deletion key dropped (planUndo leaves the deletion to the caller). */
const withoutDeletion = plan => ({
  ...plan,
  restores: plan.restores.map(({ _id, c, ...rest }) => {
    assert.deepEqual(rest, { "flags.-=wall-autocomplete": null });
    return { _id, c };
  }),
});

test("planUndo {all:false}: the latest run only, generated vs restored, remaining count", () => {
  assert.deepEqual(planUndo(UNDO_WALLS, { all: false }), {
    stamped: 3, latest: "2026-01-02T00:00:00Z", generated: ["b"],
    restores: [{ _id: "c", c: [0, 0, 80, 0] }], remaining: 1,
  });
});

test("planUndo {all:true} and the empty scene", () => {
  assert.deepEqual(planUndo(UNDO_WALLS, { all: true }).generated, ["a", "b"]);
  assert.deepEqual(planUndo([]), { stamped: 0, latest: null, generated: [], restores: [], remaining: 0 });
  assert.equal(planUndo([{ _id: "x", c: [0, 0, 1, 0] }]).stamped, 0, "no flags at all");
});

test("planUndo deep-equals the legacy oracle on every selection", () => {
  for (const all of [false, true]) assert.deepEqual(planUndo(UNDO_WALLS, { all }), withoutDeletion(legacyPlan(UNDO_WALLS, { all })), `all=${all}`);
  assert.deepEqual(planUndo([]), legacyPlan([]));
  const shuffled = [UNDO_WALLS[2], UNDO_WALLS[4], UNDO_WALLS[0], UNDO_WALLS[3], UNDO_WALLS[1]];
  assert.deepEqual(planUndo(shuffled), withoutDeletion(legacyPlan(shuffled)), "input order");
});

test("planUndo never aliases priorC into the restore it returns", () => {
  const { restores } = planUndo(UNDO_WALLS);
  restores[0].c[0] = 99;
  assert.deepEqual(UNDO_WALLS[2].flags["wall-autocomplete"].priorC, [0, 0, 80, 0]);
});

test("round trip: a run's creates are what undo deletes and its updates what it restores", () => {
  for (const fx of FIXTURES.filter(f => f.walls).slice(0, 12)) {
    const res = runEngine(fx.walls, { gridSize: 100, runId: "r1" });
    const plan = planUndo(applied(fx.walls, res));
    assert.equal(plan.generated.length, res.creates.length, fx.name);
    assert.equal(plan.restores.length, res.updates.filter(u => u.flags?.["wall-autocomplete"]?.priorC).length, fx.name);
    if (res.creates.length || res.updates.length) assert.equal(plan.latest, "r1", fx.name);
  }
  const [first] = FIXTURES;
  const res = runEngine(first.walls, { gridSize: 100, runId: "r1" });
  const plan = planUndo(applied(first.walls, res));
  assert.equal(plan.generated.length, res.creates.length);
  assert.equal(plan.restores.length, res.updates.length);
});

test("glue: undo restores a trimmed wall with a _del flag deletion and deletes the latest run's walls", async () => {
  const F = await wallsWorld();
  await import("../pentaryn-walls.mjs");
  F.fire("init");
  F.fire("ready");
  await wasmReady;
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const scene = makeScene(F, { id: "sceneUndo000001", name: "U", walls: UNDO_WALLS });
  const from = F.calls.length;
  const out = await withConsole(F, () => game.pentaryn.walls.undo({ sceneId: scene.id }));
  assert.deepEqual(out, { deleted: 1, restored: 1, run: "2026-01-02T00:00:00Z" });
  const writes = F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op)).map(c => [c.op, c.data]);
  assert.deepEqual(writes, [
    ["updateEmbeddedDocuments", [{ _id: "c", c: [0, 0, 80, 0], "flags.wall-autocomplete": "<_del>" }]],
    ["deleteEmbeddedDocuments", ["b"]],
  ]);
  const chat = F.calls.slice(from).find(c => c.op === "ChatMessage.create").data.content;
  assert.match(chat, /1 earlier run still applied — undo again to peel back further/);
  const all = await withConsole(F, () => game.pentaryn.walls.undo({ sceneId: scene.id, all: true }));
  assert.deepEqual(all, { deleted: 2, restored: 1, run: "all" });
});
