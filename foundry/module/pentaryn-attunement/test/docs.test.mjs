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

// items-journal-17 (optional check from the finding): the README's API table has a row for every
// method the manifest publishes, so describe() and the README cannot drift apart silently.
test("README API table names every manifest row", async () => {
  const { MANIFEST } = await import("../api-manifest.mjs");
  const api = README.slice(README.indexOf("## API"), README.indexOf("\n## ", README.indexOf("## API") + 1));
  const rows = new Set([...api.matchAll(/^\| `([A-Za-z]+)\(/gm)].map(m => m[1]));
  const paths = MANIFEST.rows.map(r => r.path);
  assert.ok(paths.length >= 7);
  assert.deepEqual(paths.filter(p => !rows.has(p)), []);
});
