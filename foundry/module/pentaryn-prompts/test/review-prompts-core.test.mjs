/**
 * Final code review (prompts-core): edge cases against promises the code already makes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParty, xpBudget } from "../core/xp.mjs";

test("parseParty: an unreadable size is null, not a RangeError", () => {
  assert.equal(parseParty({ size: 2.5, level: 5 }), null);
  assert.equal(parseParty({ size: 1e10, level: 3 }), null);
  assert.equal(parseParty("5000000000x5"), null);
  assert.equal(xpBudget({ size: 2.5, level: 5 }), null);
  assert.deepEqual(parseParty("0x5"), null);
  assert.deepEqual(parseParty({ level: 5, size: 4 }), [5, 5, 5, 5]);
  assert.deepEqual(parseParty("4x3"), [3, 3, 3, 3]);
});
