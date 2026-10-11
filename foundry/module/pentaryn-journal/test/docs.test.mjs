// Doc guard (items-journal-37, README half): report() is not listed as GM-only (the code has no gate),
// and the hidden folderName setting is documented.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("report() is not under 'For the GM only'", () => {
  const gmOnly = README.split("For the GM only:")[1]?.split(/\n- \*\*/)[0] ?? "";
  assert.doesNotMatch(gmOnly, /`report\(\)`/);
  assert.match(README, /`report\(\)` \(not gated/);
});

test("the folderName setting is documented", () => {
  assert.match(README, /`folderName`/);
});
