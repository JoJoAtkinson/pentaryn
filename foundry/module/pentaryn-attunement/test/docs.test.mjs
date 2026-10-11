// Doc guard (items-journal-17, README half): no hard-coded fixture count, and no "??=" claim the code
// does not make (patchProficiencyMap tests `== null`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("README states no fixture count", () => {
  assert.doesNotMatch(README, /\d+ fixtures/);
});

test("README does not claim the proficiency patch uses ??=", () => {
  assert.doesNotMatch(README, /\?\?=/);
});
