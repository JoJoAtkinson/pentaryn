/**
 * prompts-core-M9 [declared]: renderGather was ~97 lines and wrote the "which encounters hold built
 * t#" query out three times (the Shared-with line, the overview's Built line and a shared built's
 * `shared=` attribute). core/gather-text.mjs has a private `homesOf(sc, t)` that all three call and a
 * private `renderOverview(view, sc)` for the `<overview>` block; neither is exported, and the gather
 * goldens stay byte-identical (gather.test.mjs, d6-gather.test.mjs, pt2-5-gather.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../core/gather-text.mjs", import.meta.url), "utf8");
const count = re => (src.match(re) ?? []).length;
const body = head => src.slice(src.indexOf(head), src.indexOf("\n}\n", src.indexOf(head)));

test("prompts-core-M9: one private homesOf holds the encounters-holding-t query", () => {
  assert.match(src, /^function homesOf\(sc, t\) \{$/m);
  assert.equal(count(/\.built\.includes\(/g), 1);   // homesOf's own body only
  assert.equal(count(/\bhomesOf\(sc, /g), 4);        // its definition + the three call sites
});

test("prompts-core-M9: the overview block is a private renderOverview; renderGather calls it", () => {
  assert.match(src, /^function renderOverview\(view, sc\) \{$/m);
  const gather = body("export function renderGather(");
  assert.match(gather, /L\.push\(\.\.\.renderOverview\(view, sc\)\)/);
  assert.doesNotMatch(gather, /<overview>/);
  assert.ok(gather.split("\n").length <= 70, `renderGather is ${gather.split("\n").length} lines`);
});

test("prompts-core-M9: homesOf and renderOverview stay off the exports", async () => {
  const T = await import("../core/gather-text.mjs");
  const geo = await import("../geometry-core.mjs");
  for (const name of ["homesOf", "renderOverview"]) {
    assert.equal(name in T, false);
    assert.equal(name in geo, false);
  }
});
