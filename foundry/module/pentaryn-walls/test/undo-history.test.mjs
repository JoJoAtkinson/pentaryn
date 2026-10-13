// walls-edge-2: the glue side of the per-run history — undo drops only the latest run's
// `moves` entry from a wall an earlier run still owns (its own file: one glue world per file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";
import { wasmReady } from "./fixtures/engine.mjs";

const R1 = "2026-01-01T00:00:00Z", R2 = "2026-01-02T00:00:00Z";

test("glue walls-edge-2: undo drops only moves.<latest> on a wall an earlier run still owns", async () => {
  const F = await wallsWorld();
  await import("../pentaryn-walls.mjs");
  F.fire("init");
  F.fire("ready");
  await wasmReady;
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const scene = makeScene(F, { id: "sceneUndoEdge02", name: "E", walls: [
    { _id: "g", c: [0, 0, 50, 0], flags: { "wall-autocomplete": { generated: true, run: R1, moves: { [R2]: [0, 0, 60, 0] } } } },
    { _id: "u", c: [0, 9, 30, 9], flags: { "wall-autocomplete": { rule: "X1", moves: { [R1]: [0, 9, 80, 9], [R2]: [0, 9, 50, 9] } } } },
    { _id: "v", c: [0, 19, 30, 19], flags: { "wall-autocomplete": { rule: "X1", moves: { [R2]: [0, 19, 50, 19] } } } },
  ] });
  const from = F.calls.length;
  const out = await withConsole(F, () => game.pentaryn.walls.undo({ sceneId: scene.id }));
  assert.deepEqual(out, { deleted: 0, restored: 3, run: R2 });
  const writes = F.calls.slice(from).filter(c => /EmbeddedDocuments$/.test(c.op)).map(c => [c.op, c.data]);
  assert.deepEqual(writes, [
    ["updateEmbeddedDocuments", [
      { _id: "g", c: [0, 0, 60, 0], [`flags.wall-autocomplete.moves.${R2}`]: "<_del>" },
      { _id: "u", c: [0, 9, 50, 9], [`flags.wall-autocomplete.moves.${R2}`]: "<_del>" },
      { _id: "v", c: [0, 19, 50, 19], "flags.wall-autocomplete": "<_del>" },
    ]],
  ]);
});
