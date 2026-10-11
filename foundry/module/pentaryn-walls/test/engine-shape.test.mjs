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

/** Count Array#filter calls and Set constructions while `fn` runs (the engine resolves both at call time). */
function allocations(fn) {
  const counts = { filter: 0, set: 0 };
  const RealSet = globalThis.Set;
  const filter = Array.prototype.filter;
  Array.prototype.filter = function (...args) { counts.filter++; return filter.apply(this, args); };
  globalThis.Set = class extends RealSet { constructor(...args) { super(...args); counts.set++; } };
  try {
    fn();
  } finally {
    Array.prototype.filter = filter;
    globalThis.Set = RealSet;
  }
  return counts;
}

test("senses-walls-cursors-5: no per-call obstacle copy in the hot scans (allocation counter)", () => {
  assert.doesNotMatch(ENGINE, /function obstacles\(/);
  // Before the change: rooms(5) made 987 filter calls and 1161 Sets; rooms(10) 3967 and 4721.
  const five = allocations(() => runEngine(rooms(5), { gridSize: 100, runId: "c" }));
  const ten = allocations(() => runEngine(rooms(10), { gridSize: 100, runId: "c" }));
  assert.ok(five.filter <= 107 && five.set <= 761, JSON.stringify(five));
  assert.ok(ten.filter <= 407 && ten.set <= 3121, JSON.stringify(ten));
});
