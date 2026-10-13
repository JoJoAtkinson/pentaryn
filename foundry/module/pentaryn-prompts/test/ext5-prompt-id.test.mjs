/**
 * prompts-core-EXT-5 [declared]: the "is this a prompt id?" test (/^p\d+$/) was written three times,
 * once in core/doors.mjs and twice in replace.mjs's encounterLines. core/group.mjs, which hands out
 * the p# ids (assignIds), now exports isPromptId and both files use it. Same matching, no behaviour
 * change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("prompts-core-EXT-5: core/group.mjs exports isPromptId with the old matching", async () => {
  const { isPromptId } = await import("../core/group.mjs");
  assert.equal(typeof isPromptId, "function");
  // oracle: the old /^p\d+$/ test on String(id ?? "")
  for (const id of ["p1", "p12", "p007"]) assert.equal(isPromptId(id), true, id);
  for (const id of ["p", "t1", "E1", "s1", "P1", "p1a", " p1", "p1 ", "xp1", "", null, undefined, 1])
    assert.equal(isPromptId(id), false, String(id));
});

test("prompts-core-EXT-5: the prompt-id pattern is written once, in core/group.mjs", () => {
  const pattern = /\/\^p\\d\+\$\//g;
  assert.equal((read("core/group.mjs").match(pattern) ?? []).length, 1);
  for (const f of ["core/doors.mjs", "replace.mjs"]) {
    assert.equal((read(f).match(pattern) ?? []).length, 0, `${f} restates /^p\\d+$/`);
    assert.match(read(f), /\bisPromptId\b/, `${f} does not use isPromptId`);
  }
});
