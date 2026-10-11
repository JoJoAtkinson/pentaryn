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

test("prompts-lookup-24: tokenDataFrom — toObject minus _id, x/y (snapped on request), extra as given", async () => {
  const { tokenDataFrom } = await import("../tokens-adapter.mjs");
  const made = [];
  const actor = {
    getTokenDocument: async (pos, opts) => (made.push([pos, opts.parent]),
      { toObject: () => ({ _id: "z", name: "A", x: pos.x, y: pos.y, width: 1, flags: {} }), getSnappedPosition: p => ({ x: p.x + 1, y: p.y + 2 }) }),
  };
  const scene = { id: "s" };
  assert.deepEqual(await tokenDataFrom(actor, scene, { at: { x: 10, y: 20 } }), { name: "A", x: 10, y: 20, width: 1, flags: {} });
  assert.deepEqual(made[0], [{ x: 10, y: 20 }, scene]);
  assert.deepEqual(await tokenDataFrom(actor, scene, { at: { x: 10, y: 20 }, snap: true }), { name: "A", x: 11, y: 22, width: 1, flags: {} });
  const swap = await tokenDataFrom(actor, scene, { at: { x: 10.5, y: 20.5 }, x: 11, y: 21, extra: { elevation: 0, level: null } });
  assert.deepEqual(swap, { name: "A", x: 11, y: 21, width: 1, flags: {}, elevation: 0, level: null });
  assert.equal(Object.hasOwn(swap, "level"), true, "a null level passed is an own property");
  const plain = await tokenDataFrom(actor, scene, { at: { x: 1, y: 2, mode: "same" }, extra: { hidden: false } });
  assert.equal("level" in plain, false, "no level unless passed");
  assert.equal("mode" in plain, false);
  await assert.rejects(tokenDataFrom({}, scene, { at: { x: 0, y: 0 } }), { message: "a.getTokenDocument is not a function" });
});

test("prompts-lookup-15 (DP7): assetUrl — today's URLs without a route prefix; the prefix kept with one; data:/blob: as they are", async () => {
  const { assetUrl } = await import("../core/text.mjs");
  const plain = p => "/" + p, prefixed = p => "/foundry/" + p;
  assert.deepEqual(["maps/a.webp", "/maps/a.webp", "https://x/y.png", "http://x/y.png"].map(s => assetUrl(s, plain)),
    ["/maps/a.webp", "/maps/a.webp", "https://x/y.png", "http://x/y.png"]);
  assert.equal(assetUrl("maps/a.webp", prefixed), "/foundry/maps/a.webp");
  assert.equal(assetUrl("data:x", plain), "data:x");
  assert.equal(assetUrl("blob:abc", plain), "blob:abc");
});
