// Doc guards (senses-walls-cursors-8, README half): no hard-coded fixture count, and every test file the
// README names exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const README = readFileSync(new URL("README.md", ROOT), "utf8");

test("README states no fixture count", () => {
  assert.doesNotMatch(README, /\d+ fixtures/);
});

test("every test/… path the README names exists", () => {
  const paths = [...new Set([...README.matchAll(/`(test\/[\w./-]+\.mjs)`/g)].map(m => m[1]))];
  assert.ok(paths.length >= 3);
  for (const p of paths) assert.ok(existsSync(new URL(p, ROOT)), p);
});
