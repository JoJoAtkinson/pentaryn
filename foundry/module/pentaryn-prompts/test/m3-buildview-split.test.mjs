/**
 * prompts-core-M3 [declared]: buildView was ~180 lines doing six jobs. The encounter relations,
 * the loners' notes and the door groups are private helpers (encounterRelations, aloneNotes,
 * doorGroups) called in that order; the gather goldens pin that the output is byte-identical.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../core/view.mjs", import.meta.url), "utf8");
const HELPERS = ["encounterRelations", "aloneNotes", "doorGroups"];

/** The source lines of a top-level function, from its `function` line to the closing `}` at column 0. */
function body(name) {
  const lines = src.split("\n");
  const start = lines.findIndex(l => new RegExp(`^(export )?function ${name}\\(`).test(l));
  assert.ok(start >= 0, `${name} is a top-level function in core/view.mjs`);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1);
}

test("prompts-core-M3: the three jobs are private top-level helpers", () => {
  for (const h of HELPERS) {
    body(h);
    assert.doesNotMatch(src, new RegExp(`export function ${h}\\(`), `${h} stays private`);
  }
});

test("prompts-core-M3: buildView calls the helpers in the old order and is no longer ~180 lines", () => {
  const b = body("buildView").join("\n");
  const at = HELPERS.map(h => b.indexOf(`${h}(`));
  for (const [i, h] of HELPERS.entries()) assert.ok(at[i] > 0, `buildView calls ${h}`);
  assert.deepEqual([...at].sort((x, y) => x - y), at, "relations, then loners, then doors");
  assert.ok(body("buildView").length <= 130, `buildView is ${body("buildView").length} lines`);
});
