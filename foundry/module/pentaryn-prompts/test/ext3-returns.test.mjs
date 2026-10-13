/**
 * EXT-3 (final review 2026-10-12, prompts-adapters): the manifest's `returns` strings had drifted
 * from what the code returns — crops lacked `mimeType` and the error row's `scene`, model lacked
 * `nav`. This conformance test parses each row's `returns` key list and compares it with the keys
 * of a real sample (the crop-row golden, an error row from renderCrops, a scene model of the stub
 * world), so the next drift fails the gate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";
import { installWorld } from "./fixtures/world.mjs";

const F = await installWorld();
const { MANIFEST } = await import("../api-manifest.mjs");
const { renderCrops } = await import("../crops-adapter.mjs");
const { sceneModel } = await import("../scene-adapter.mjs");

const rowOf = path => MANIFEST.rows.find(r => r.path === path);

/**
 * The object shapes in a `returns` string: each innermost `{ … }` is one shape, a list of keys;
 * a key written `png | path` is one slot that either name fills. A call's `(…)` is dropped.
 */
function shapesOf(returns) {
  return [...returns.replace(/\([^()]*\)/g, "").matchAll(/\{([^{}]*)\}/g)]
    .map(m => m[1].split(",").map(k => k.split("|").map(s => s.trim()).filter(Boolean)).filter(k => k.length));
}

/** Does `sample` have exactly the keys of `shape` (one name per slot, nothing extra)? */
function fits(shape, sample) {
  const keys = Object.keys(sample);
  const used = shape.map(slot => slot.filter(k => keys.includes(k)));
  return used.every(u => u.length === 1) && keys.length === shape.length;
}

const keysMsg = (shape, sample) => `returns ${JSON.stringify(shape)} vs sample keys ${JSON.stringify(Object.keys(sample))}`;

test("EXT-3: crops' returns names every key of the image row (golden crop-row) and of the error row", async () => {
  const shapes = shapesOf(rowOf("crops").returns);
  assert.equal(shapes.length, 2, "EXT-3: crops returns an image row | an error row");
  const [image, error] = shapes;
  const [row] = readJSON(new URL("./golden/crop-row.json", import.meta.url));
  assert.ok(fits(image, row), `EXT-3: image row — ${keysMsg(image, row)}`);
  const [bad] = await renderCrops({ scenes: {}, encounters: { E9: { sceneId: "gone" } } }, ["E9"]);
  assert.ok(fits(error, bad), `EXT-3: error row — ${keysMsg(error, bad)}`);
});

test("EXT-3: model's returns names every key of a scene model (and of the scene-meta golden)", () => {
  const [shape] = shapesOf(rowOf("model").returns);
  const model = sceneModel(F.s1);
  assert.ok(fits(shape, model), `EXT-3: model — ${keysMsg(shape, model)}`);
  const meta = readJSON(new URL("./golden/scene-meta.json", import.meta.url));
  for (const k of Object.keys(meta)) assert.ok(shape.some(slot => slot.includes(k)), `EXT-3: model returns lacks ${k}`);
});
