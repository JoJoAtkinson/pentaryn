/**
 * senses-M2 [declared] (final review 2026-10-12): reconcile() was one 95-line body doing five jobs.
 * It is now a short sequence of named steps, awaited in the same order as before:
 * resolveDesired → (plan) → restoreTokens → removeSquares → applyWanted → resyncCarried → remember.
 * The writes and the summary shape are pinned by the light-* goldens and reconcile-summary.test.mjs;
 * this test pins the shape of the code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../light.mjs", import.meta.url), "utf8");
const STEPS = ["resolveDesired", "restoreTokens", "removeSquares", "applyWanted", "resyncCarried", "remember"];

/** The text of `async function name(...) { ... }` up to its closing brace at column 0. */
function body(name) {
  const start = src.search(new RegExp(`^(async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `${name} is defined in light.mjs`);
  const end = src.indexOf("\n}\n", start);
  return src.slice(start, end + 2);
}

test("senses-M2: every reconcile step is its own function", () => {
  for (const name of STEPS) body(name);
});

test("senses-M2: reconcile is a short sequence calling the steps in the old await order", () => {
  const r = body("reconcile");
  assert.ok(r.split("\n").length <= 25, `reconcile is ${r.split("\n").length} lines`);
  const at = STEPS.map(name => r.indexOf(`${name}(`));
  assert.ok(at.every(i => i > 0), "reconcile calls each step");
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in order");
  assert.ok(r.indexOf("planSpellLight(") > at[0] && r.indexOf("planSpellLight(") < at[1], "planned after the flag is resolved");
});
