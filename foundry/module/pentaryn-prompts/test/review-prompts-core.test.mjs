/**
 * Final code review (prompts-core): edge cases against promises the code already makes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParty, xpBudget } from "../core/xp.mjs";
import { stripHtml } from "../core/text.mjs";

test("parseParty: an unreadable size is null, not a RangeError", () => {
  assert.equal(parseParty({ size: 2.5, level: 5 }), null);
  assert.equal(parseParty({ size: 1e10, level: 3 }), null);
  assert.equal(parseParty("5000000000x5"), null);
  assert.equal(xpBudget({ size: 2.5, level: 5 }), null);
  assert.deepEqual(parseParty("0x5"), null);
  assert.deepEqual(parseParty({ level: 5, size: 4 }), [5, 5, 5, 5]);
  assert.deepEqual(parseParty("4x3"), [3, 3, 3, 3]);
});

test("stripHtml: an out-of-range numeric entity is left as written", () => {
  assert.equal(stripHtml("a &#x110000; b"), "a &#x110000; b");
  assert.equal(stripHtml("&#99999999;"), "&#99999999;");
  assert.equal(stripHtml("it&#39;s &#x41; &#x10FFFF;"), "it's A \u{10FFFF}");
});
