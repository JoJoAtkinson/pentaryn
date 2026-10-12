// riders-ext-6 (comment only): isArcaneRecovery's doc said it matched on "PHB source", but the code
// only checks the identifier and the name — a PHB copy keeps its identifier, so a source check would
// add nothing. Behaviour is pinned by table.mjs; this pins the doc to what the code does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../table-core.mjs", import.meta.url), "utf8");

test("riders-ext-6: isArcaneRecovery's doc names identifier or name, never a source check", () => {
  const at = src.indexOf("export function isArcaneRecovery(");
  assert.notEqual(at, -1, "isArcaneRecovery exists");
  const doc = src.slice(src.lastIndexOf("/**", at), at);
  assert.doesNotMatch(doc, /source/i);
  assert.match(doc, /Identifier or name/);
});
