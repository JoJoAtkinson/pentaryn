/**
 * prompts-core-M7 [declared]: gather() and crops() each wrote out the crop rendering — read
 * cropMaxPerCall and cropLongSidePx, renderCrops, then upload unless cropsAs is "base64". They share
 * one private `cropImages(manifest, {ids, cropsAs})` in gather.mjs (not exported): same settings
 * reads, same file upload path. gather() still renders its encounters in id order; crops() renders
 * the ones it was asked for, in the order asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../gather.mjs", import.meta.url), "utf8");
const count = re => (src.match(re) ?? []).length;

test("prompts-core-M7: one private cropImages does the settings reads, the render and the upload", () => {
  assert.match(src, /^async function cropImages\(manifest, \{ ids, cropsAs \}\)/m);
  assert.equal(count(/\bexport\b[^\n]*\bcropImages\b/g), 0);
  assert.equal(count(/setting\("cropMaxPerCall"/g), 1);
  assert.equal(count(/setting\("cropLongSidePx"/g), 1);
  assert.equal(count(/\brenderCrops\(/g), 1);
  assert.equal(count(/await cropsToFiles\(/g), 1);
});

test("prompts-core-M7: gather() and crops() both call cropImages", () => {
  const body = name => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf("\n}\n", src.indexOf(`export async function ${name}(`)));
  assert.match(body("gather"), /await cropImages\(manifest, \{ ids: Object\.keys\(manifest\.encounters\)\.sort\(idCompare\), cropsAs \}\)/);
  assert.match(body("crops"), /await cropImages\(manifest, \{ ids, cropsAs \}\)/);
});

test("prompts-core-M7: cropImages stays off the module's exports", async () => {
  const { installWorld, captureConsole } = await import("./fixtures/world.mjs");
  await installWorld();
  const G = (await captureConsole(() => import("../gather.mjs"))).value;
  assert.equal("cropImages" in G, false);
});
