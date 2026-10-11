// i18n: lookup has no lang file and no UI text (C04: no `languages`). This keeps that true — no
// source file outside lib/ and test/ names a PENTARYN_ key or calls i18n.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { manifestOf, sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("no lang file and no languages in module.json", () => {
  assert.equal(existsSync(new URL("lang", ROOT)), false);
  assert.equal(manifestOf(ROOT).languages, undefined);
});

test("no PENTARYN_ key literal and no i18n call in the module's sources", () => {
  assert.deepEqual([...sourceScan(ROOT, /PENTARYN_/), ...sourceScan(ROOT, /\bi18n\./)], []);
});
