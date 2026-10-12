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
    assert.equal(plan.restores.length, res.updates.filter(u => u.flags?.["wall-autocomplete"]?.moves?.r1).length, fx.name);
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

// walls-edge-2: a later run that moves a generated wall must not take over its run stamp. Each
// wall keeps the run that created it, plus `moves.<run>` = the coordinates each run first moved it from.
const R1 = "2026-01-01T00:00:00Z", R2 = "2026-01-02T00:00:00Z";
const snapFx = () => FIXTURES.find(f => f.name === "endpoint just off a diagonal snaps rather than extends");
/** The fixture with its stub turned into a wall run 1 generated. */
const afterRun1 = () => snapFx().walls.map(w => w._id === "stub"
  ? { ...w, flags: { "wall-autocomplete": { generated: true, run: R1, rule: "F2" } } } : w);

test("walls-edge-2: undoing run 2 restores a run-1 wall it moved; undoing run 1 then deletes it", () => {
  const before = afterRun1();
  const res = runEngine(before, { gridSize: 100, runId: R2 });
  assert.equal(res.updates.length, 1, "run 2 moves the run-1 stub");
  const scene = applied(before, res);
  const stub = scene.find(w => w._id === "stub");
  const plan2 = planUndo(scene);
  assert.equal(plan2.latest, R2);
  assert.deepEqual(plan2.generated, [], "run 2 created nothing — the run-1 wall is not deleted");
  assert.deepEqual(plan2.restores, [{ _id: "stub", c: before.find(w => w._id === "stub").c }]);
  assert.equal(plan2.remaining, 1, "run 1 is still applied");
  // Undo run 2 as the glue does: restore c, drop moves.<R2>; the creating run stays.
  const after2 = scene.map(w => w === stub ? { ...w, c: plan2.restores[0].c,
    flags: { "wall-autocomplete": { ...w.flags["wall-autocomplete"], moves: {} } } } : w);
  const plan1 = planUndo(after2);
  assert.equal(plan1.latest, R1);
  assert.deepEqual(plan1.generated, ["stub"]);
  assert.equal(plan1.remaining, 0);
});

test("walls-edge-2: a user wall moved by two runs peels back one run at a time; all=true restores the first prior", () => {
  const wall = { _id: "u", c: [0, 0, 30, 0], flags: { "wall-autocomplete": {
    run: R1, rule: "X1", priorC: [0, 0, 80, 0],          // legacy flat stamp from run 1
    moves: { [R2]: [0, 0, 50, 0] } } } };                  // run 2's entry
  assert.deepEqual(planUndo([wall]).restores, [{ _id: "u", c: [0, 0, 50, 0] }]);
  assert.equal(planUndo([wall]).remaining, 1);
  assert.deepEqual(planUndo([wall], { all: true }).restores, [{ _id: "u", c: [0, 0, 80, 0] }]);
});

test("walls-edge-2: a run stamps moves.<run> and never the flat run/priorC on an update; an existing entry is kept", () => {
  const before = afterRun1();
  const [u] = runEngine(before, { gridSize: 100, runId: R2 }).updates;
  const f = u.flags["wall-autocomplete"];
  assert.equal(f.run, undefined, "an update never rewrites the creating run");
  assert.equal(f.priorC, undefined);
  assert.deepEqual(Object.keys(f.moves), [R2]);
  const again = before.map(w => w._id === "stub"
    ? { ...w, flags: { "wall-autocomplete": { ...w.flags["wall-autocomplete"], moves: { [R2]: [1, 2, 3, 4] } } } } : w);
  const [u2] = runEngine(again, { gridSize: 100, runId: R2 }).updates;
  assert.equal(u2.flags["wall-autocomplete"].moves?.[R2], undefined, "the run's first prior is never overwritten");
});

test("walls-edge-2: a run id with a '.' is stamped dot-free, so moves.<run> is one flag key", () => {
  const res = runEngine(afterRun1(), { gridSize: 100, runId: "2026-01-02T00:00:00.123Z" });
  assert.deepEqual(Object.keys(res.updates[0].flags["wall-autocomplete"].moves), ["2026-01-02T00:00:00,123Z"]);
});

test("walls-edge-2: the wasm backend stamps the same shape", async () => {
  await wasmReady;
  const { get } = await import("../walls-core.mjs");
  const before = afterRun1();
  const [u] = get("wasm").run(before, { gridSize: 100, runId: R2 }).updates;
  assert.deepEqual(u.flags["wall-autocomplete"], { rule: "X1", moves: { [R2]: before.find(w => w._id === "stub").c } });
});

test("walls-edge-5: an ISO-stamped run outranks a non-ISO run id; non-ISO ids undo oldest-first among themselves", () => {
  const gen = (id, run) => ({ _id: id, c: [0, 0, 10, 0], flags: { "wall-autocomplete": { generated: true, run } } });
  // "zz" sorts after any ISO string, and V8 reads "run-2099" as the year 2099: neither may stay latest.
  const iso = "2026-01-02T00:00:00,123Z";               // a real run id, stamped dot-free
  const scene = [gen("a", "zz"), gen("b", "run-2099"), gen("c", iso), gen("d", R1)];
  const plan = planUndo(scene);
  assert.equal(plan.latest, iso, "the newest ISO run is undone first");
  assert.deepEqual(plan.generated, ["c"]);
  assert.equal(plan.remaining, 3);
  const isoGone = scene.filter(w => !["c", "d"].includes(w._id));
  assert.equal(planUndo(isoGone).latest, "zz", "then the non-ISO ids, by string order");
  // all=true restores a user wall to its earliest run's prior under the same order.
  const u = { _id: "u", c: [0, 9, 30, 9], flags: { "wall-autocomplete": { rule: "X1",
    moves: { [R1]: [0, 9, 50, 9], zz: [0, 9, 80, 9] } } } };
  assert.equal(planUndo([u]).latest, R1);
  assert.deepEqual(planUndo([u], { all: true }).restores, [{ _id: "u", c: [0, 9, 80, 9] }]);
});
