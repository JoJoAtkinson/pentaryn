// Standalone engine findings (guide §4): -6 one segment-construction path, -5 the hot-path
// allocations. The engine-golden hashes prove the output is unchanged; these pin the shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, lintOnly, runEngine } from "./fixtures/engine.mjs";
import { FIXTURES } from "./fixtures/corpus.mjs";
import { rooms } from "./fixtures/rooms.mjs";

const ENGINE = readFileSync(new URL("../core/engine.mjs", import.meta.url), "utf8");

test("senses-walls-cursors-6: one reindex copy, used by lintOnly, analyze and each level group", () => {
  assert.equal(ENGINE.match(/\(\{\.\.\.s, c: \[\.\.\.s\.c\], idx: i\}\)/g).length, 1);
  assert.match(ENGINE, /return lint\(toSegs\(walls\), cfg\);/);
  assert.match(ENGINE, /const segs = toSegs\(walls\);/);
  assert.match(ENGINE, /const segs = reindex\(group\);/);
});

test("senses-walls-cursors-6: no entry point mutates its input walls", () => {
  for (const fx of FIXTURES.filter(f => f.walls)) {
    const before = JSON.stringify(fx.walls);
    lintOnly(fx.walls, { gridSize: 100 });
    analyze(fx.walls, { gridSize: 100 });
    runEngine(fx.walls, { gridSize: 100, runId: "m" });
    assert.equal(JSON.stringify(fx.walls), before, fx.name);
  }
});
