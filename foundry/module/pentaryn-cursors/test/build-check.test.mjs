// cursors-EXT-4: scripts/foundry/cursors/build.mjs (repo tool, not shipped) validates KEYS without
// a resvg build. checkKeys is pure, so a fake KEYS entry can carry values the frozen real KEYS
// cannot (extreme "top", a fractional or off-canvas hotspot, a missing source).
// scripts/tests/test_cursors_build.py still runs the real `--check-sources` over the committed KEYS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { KEYS } from "../cursors-core.mjs";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const TOOL = join(REPO, "scripts", "foundry", "cursors");
const SRC = join(TOOL, "src");
const build = () => import(pathToFileURL(join(TOOL, "build.mjs")).href);
const real = KEYS.target;

test("EXT-4: build.mjs imports without running the build, exposing EXTREMES and checkKeys", async () => {
  const { EXTREMES, SCORES, checkKeys } = await build();
  assert.deepEqual(EXTREMES, ["centre", "up-right", "down-left", "bottom"]);
  assert.deepEqual(Object.keys(SCORES), EXTREMES.filter(e => e !== "centre"), "the score table covers every non-centre extreme");
  assert.equal(typeof checkKeys, "function");
});

test("EXT-4: the committed KEYS pass checkKeys", async () => {
  const { checkKeys } = await build();
  assert.deepEqual(checkKeys(KEYS, SRC), []);
});

test("EXT-4: an extreme not in EXTREMES is a problem", async () => {
  const { checkKeys } = await build();
  const problems = checkKeys({ a: { ...real, extreme: "top" } }, SRC);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^a: unknown extreme "top"/);
});

test("EXT-4: a missing source file is a problem", async () => {
  const { checkKeys } = await build();
  const problems = checkKeys({ a: { ...real, src: "no-such-glyph.svg" } }, SRC);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^a: source no-such-glyph\.svg not in /);
});

test("EXT-4: a hotspot that is not two integers in 0..31 is a problem", async () => {
  const { checkKeys } = await build();
  for (const hotspot of [[16, 32], [-1, 0], [16.5, 16], [16], [16, 16, 16], "16,16", undefined, [16, "16"]]) {
    const problems = checkKeys({ a: { ...real, hotspot } }, SRC);
    assert.equal(problems.length, 1, JSON.stringify(hotspot));
    assert.match(problems[0], /^a: hotspot .* is not two integers in 0\.\.31$/);
  }
  assert.deepEqual(checkKeys({ a: { ...real, hotspot: [0, 31] } }, SRC), []);
});

test("EXT-4: every problem of every key is reported, in KEYS order", async () => {
  const { checkKeys } = await build();
  const problems = checkKeys({ a: { ...real, extreme: "top", hotspot: [40, 0] }, b: { ...real, src: "gone.svg" } }, SRC);
  assert.deepEqual(problems.map(p => p.split(":")[0]), ["a", "a", "b"]);
});
