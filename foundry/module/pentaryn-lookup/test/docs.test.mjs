// Doc guards (prompts-lookup-26): the README may not drift from module.json's version, and states no
// hard-coded test count (run `node test/run.mjs` instead).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const README = readFileSync(new URL("README.md", ROOT), "utf8");
const { version } = manifestOf(ROOT);

test("README: every 'shipped — x.y.z' names module.json's version", () => {
  for (const m of README.matchAll(/shipped — (\d+\.\d+\.\d+)/g)) assert.equal(m[1], version);
});

test("README: no hard-coded fixture count", () => {
  assert.doesNotMatch(README, /\d+ fixtures/);
});
