/**
 * prompts-core-M6 [declared]: the strict "already a segment, or normalise it" test
 * (`a && b && "sight" in w ? w : wallSegment(w)`) was written out at three sites — rayPasses
 * (core/sight.mjs), doorLines' wall list (core/doors.mjs) and makeRel (core/view.mjs). It is one
 * private `asSegment` in core/sight.mjs, never on the geometry-core barrel. doorLines' own door
 * test stays loose on purpose (a door with `a`/`b` but no `sight` is used as given).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asSegment, wallSegment } from "../core/sight.mjs";

const read = f => readFileSync(new URL(`../core/${f}`, import.meta.url), "utf8");

test("prompts-core-M6: asSegment passes a segment through and normalises anything else", () => {
  const seg = wallSegment({ id: "w1", c: [0, 0, 100, 0] });
  assert.equal(asSegment(seg), seg);
  assert.deepEqual(asSegment({ id: "w2", c: [0, 0, 0, 50], door: 1 }), wallSegment({ id: "w2", c: [0, 0, 0, 50], door: 1 }));
  // a/b without sight is not yet a segment (strict): it is normalised, sight defaults to NORMAL
  const ab = { id: "w3", a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
  assert.notEqual(asSegment(ab), ab);
  assert.deepEqual(asSegment(ab), wallSegment(ab));
});

test("prompts-core-M6: asSegment stays off the barrel", async () => {
  const geo = await import("../geometry-core.mjs");
  assert.equal("asSegment" in geo, false);
});

test("prompts-core-M6: the three strict sites call asSegment; doorLines' door test stays loose", () => {
  const strict = /\w+\.a && \w+\.b && "sight" in/g;
  const count = f => (read(f).match(strict) ?? []).length;
  assert.deepEqual(["sight.mjs", "doors.mjs", "view.mjs"].map(count), [1, 0, 0]);   // asSegment's own body only
  assert.match(read("doors.mjs"), /walls\.map\(asSegment\)/);
  assert.match(read("view.mjs"), /walls\.map\(asSegment\)/);
  assert.match(read("sight.mjs"), /const w = asSegment\(raw\)/);
  assert.match(read("doors.mjs"), /const w = raw\.a && raw\.b \? raw : wallSegment\(raw\);/);
});
