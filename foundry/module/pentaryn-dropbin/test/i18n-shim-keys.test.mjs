// dropbin-EXT-7: every legacy key the shim fills has a literal last-resort word, and no literal is orphaned.
// A key added to LEGACY_KEYS without a LITERAL would fill `undefined` when the source word is missing too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_KEYS, LITERAL } from "../i18n-shim.mjs";

test("LEGACY_KEYS and LITERAL name the same keys (dropbin-EXT-7)", () => {
  assert.ok(LITERAL && typeof LITERAL === "object", "LITERAL is exported");
  assert.deepEqual(Object.keys(LITERAL).sort(), Object.keys(LEGACY_KEYS).sort());
});
