/**
 * Adapters (guide step 10): the one wall-segment builder both sight and the gather's door lines use
 * (prompts-lookup-22), the pure marker size with the actors passed in, and the pack lookup's new
 * home (prompts-lookup-10) — the same functions under their old import paths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { wallSegmentsOf } from "../core/walls.mjs";
import { markerSizeOf } from "../core/markers.mjs";

const scene = {
  dimensions: { size: 100, distancePixels: 20 },
  grid: { distance: 5 },
  walls: [
    { id: "w1", c: [0, 0, 100, 0], sight: 20, dir: 0, door: 0, ds: 0, threshold: { sight: 2 } },
    { id: "w2", c: [0, 0, 0, 100], sight: 0, dir: 0, door: 0, ds: 0 },
    { id: "d1", c: [100, 0, 100, 100], sight: 20, dir: 0, door: 1, ds: 0, levels: new Set(["L2"]) },
  ],
};

test("prompts-lookup-22: wallSegmentsOf — level filter for sight, sight-only for the door lines", () => {
  const ids = o => wallSegmentsOf(scene, o).map(s => s.id);
  assert.deepEqual(ids(), ["w1", "w2", "d1"]);
  assert.deepEqual(ids({ levelId: "L1" }), ["w1", "w2"]);
  assert.deepEqual(ids({ levelId: "L2" }), ["w1", "w2", "d1"]);
  assert.deepEqual(ids({ sightOnly: true }), ["w1", "d1"]);
  const [w1] = wallSegmentsOf(scene);
  assert.equal(w1.threshold, 40);
  // no distancePixels: size / grid distance
  const [w] = wallSegmentsOf({ ...scene, dimensions: { size: 100 } });
  assert.equal(w.threshold, 40);
});

test("markerSizeOf: own flag first, then the actor found in the collection passed in", () => {
  const actors = new Map([["a1", { flags: { "pentaryn-prompts": { marker: "xl" } } }]]);
  assert.equal(markerSizeOf({ flags: { "pentaryn-prompts": { marker: "tiny" } }, actorId: "a1" }, actors), "tiny");
  assert.equal(markerSizeOf({ flags: {}, actorId: "a1" }, actors), "xl");
  assert.equal(markerSizeOf({ flags: {}, actorId: "a2" }, actors), null);
  assert.equal(markerSizeOf({ flags: {}, actorId: "a1" }, undefined), null);
  assert.equal(markerSizeOf(null, actors), null);
});

test("prompts-lookup-10: findItem/notFound/suggest live in packs-adapter; character-adapter re-exports them", async () => {
  const { installWorld } = await import("./fixtures/world.mjs");
  await installWorld();
  const packs = await import("../packs-adapter.mjs");
  const ch = await import("../character-adapter.mjs");
  for (const k of ["findItem", "notFound", "suggest"]) assert.equal(ch[k], packs[k], k);
});
