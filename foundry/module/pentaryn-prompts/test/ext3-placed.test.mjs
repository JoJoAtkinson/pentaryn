/**
 * prompts-core-EXT-3 [declared]: the placed document types are one private table, replace.mjs
 * PLACED (type → the scene's collection), in the create order Token, Note, AmbientLight, Tile.
 * TYPES (the per-scene create order) and whyGone's collection list are both read from it, so the
 * create order and the gone-lookup order stay the same list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../replace.mjs", import.meta.url), "utf8");

test("prompts-core-EXT-3: replace.mjs keeps one PLACED table, Token → Note → AmbientLight → Tile", () => {
  const m = src.match(/^const PLACED = Object\.freeze\(\[\n((?:\s+\[.*\],?\n)+)\]\);$/m);
  assert.ok(m, "a private `const PLACED = Object.freeze([...])` table");
  const rows = [...m[1].matchAll(/\["(\w+)", s => s\.(\w+)\]/g)].map(r => [r[1], r[2]]);
  assert.deepEqual(rows, [["Token", "tokens"], ["Note", "notes"], ["AmbientLight", "lights"], ["Tile", "tiles"]]);
  assert.doesNotMatch(src, /^export const PLACED/m, "PLACED stays private");
});

test("prompts-core-EXT-3: TYPES and whyGone are derived from PLACED, never restated", () => {
  assert.match(src, /^const TYPES = PLACED\.map\(\(\[type\]\) => type\);$/m);
  assert.doesNotMatch(src, /\["Token", "Note", "AmbientLight", "Tile"\]/, "the type list is not written out again");
  assert.doesNotMatch(src, /\[scene\.tokens, scene\.notes, scene\.lights, scene\.tiles\]/, "whyGone reads PLACED");
  const whyGone = src.slice(src.indexOf("function whyGone("), src.indexOf("/* ── plan"));
  assert.match(whyGone, /for \(const \[, collectionOf\] of PLACED\)/);
});
