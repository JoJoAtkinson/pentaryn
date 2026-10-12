/**
 * Final code review (prompts-core): edge cases against promises the code already makes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParty, xpBudget } from "../core/xp.mjs";
import { stripHtml } from "../core/text.mjs";
import { normaliseNpc } from "../npc-core.mjs";
import { normaliseAbilities } from "../build-core.mjs";

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

const OGRE = { name: "Ogre", creatureType: "giant", size: "large", cr: "2", hpAverage: 59, hpFormula: "7d10+21", acMode: "flat",
  acValue: 11, abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 } };

test("normaliseNpc: an Object.prototype name is an unknown key", () => {
  assert.deepEqual(normaliseNpc(OGRE).errors, []);
  assert.match(normaliseNpc({ ...OGRE, constructor: 1 }).errors.join(), /unknown key\(s\) constructor/);
  assert.match(normaliseNpc({ ...OGRE, toString: 1 }).errors.join(), /unknown key\(s\) toString/);
});

test("normaliseAbilities: an Object.prototype name is an unknown ability", () => {
  assert.deepEqual(normaliseAbilities({ constructor: 2, str: 1 }), { abilities: { str: 1 }, unknown: ["constructor"] });
  assert.deepEqual(normaliseAbilities(JSON.parse('{"__proto__": 3, "Dexterity": 14}')), { abilities: { dex: 14 }, unknown: ["__proto__"] });
});
