/**
 * The planner registry (guide step 19, prompts-lookup-13): replace.mjs plans each kind through one
 * PLANNERS row per KINDS entry, in KINDS order (read from the source: the table is private, and the
 * per-file surface golden pins replace.mjs's exports). The dry-run and real-run goldens of
 * replace.test pin what each planner does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KINDS } from "../prompts-core.mjs";

test("PLANNERS has one row per kind, in KINDS order, each a planner function defined in replace.mjs", () => {
  const src = readFileSync(new URL("../replace.mjs", import.meta.url), "utf8");
  const table = /const PLANNERS = Object\.freeze\(\{([^}]*)\}\);/.exec(src);
  assert.ok(table, "PLANNERS table");
  const rows = [...table[1].matchAll(/(\w+): (\w+)/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(rows.map(r => r[0]), [...KINDS]);
  for (const [, fn] of rows) assert.match(src, new RegExp(`^async function ${fn}\\(`, "m"), fn);
  assert.doesNotMatch(src, /switch \(w\.kind\)/);
});
