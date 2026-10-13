/**
 * prompts-core-M14 [declared]: core/pool.mjs imported sameName from ../build-core.mjs, so core
 * depended upward on a top-level file. sameName now lives in core/text.mjs; pool.mjs imports it from
 * there and build-core.mjs re-exports the same function (its pinned surface, golden/core-exports.json,
 * is unchanged). A core/*.mjs imports only other core files and prompts-core.mjs (the module's
 * identity constants, a leaf that imports nothing). Same matching, no behaviour change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const CORE = new URL("../core/", import.meta.url);

// The one top-level file core may read: MODULE and the other identity constants, which import nothing.
const LEAF = "../prompts-core.mjs";

test("prompts-core-M14: prompts-core.mjs (the one file core reaches up to) is a leaf", () => {
  const src = readFileSync(new URL(LEAF, CORE), "utf8");
  assert.doesNotMatch(src, /^\s*(?:import|export)\s[^;]*?from\s*"/m);
});

test("prompts-core-M14: no core/*.mjs imports from outside core/ but the identity leaf", () => {
  for (const f of readdirSync(CORE).filter(f => f.endsWith(".mjs"))) {
    const src = readFileSync(new URL(f, CORE), "utf8");
    for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s*"([^"]+)"/g)) {
      assert.ok(m[1].startsWith("./") || m[1] === LEAF, `core/${f} imports ${m[1]}, which is outside core/`);
    }
  }
});

test("prompts-core-M14: sameName lives in core/text.mjs and build-core re-exports the same function", async () => {
  const text = await import("../core/text.mjs");
  const build = await import("../build-core.mjs");
  assert.equal(typeof text.sameName, "function");
  assert.equal(build.sameName, text.sameName);
  // oracle: the old matching, unchanged
  assert.ok(text.sameName("Infernal Tiefling", "Tiefling, Infernal"));
  assert.ok(text.sameName("divine order: protector", "Divine Order: Protector"));
  assert.ok(!text.sameName("Protector", "Divine Order: Protector"));
  assert.ok(text.sameName(undefined, ""));
});
