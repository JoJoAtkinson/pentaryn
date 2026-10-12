/**
 * EXT-3 (final review 2026-10-12, ties-study): README's Extending recipe said a study namespace is
 * "a branch in `resolveFact`" — but resolve.mjs's own seam note lists the places downstream that
 * still test `fact.ns`. A new namespace that followed the README would miss them. The README bullet
 * must name every file and function that note lists, and point at the note by a line that is it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const readme = readFileSync(new URL("README.md", ROOT), "utf8");
const resolveLines = readFileSync(new URL("study/resolve.mjs", ROOT), "utf8").split("\n");

const seamStart = resolveLines.findIndex(l => l.includes("The seam is not airtight"));
const seamEnd = resolveLines.findIndex((l, i) => i > seamStart && /^\s*\*\s*$/.test(l));
const seam = resolveLines.slice(seamStart, seamEnd).join(" ");
const bulletText = (() => {
  const lines = readme.split("\n");
  const i = lines.findIndex(l => l.startsWith("- **A study namespace:**"));
  if (i < 0) return "";
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) out.push(lines[j]);
  return out.join(" ");
})();

test("EXT-3: resolve.mjs keeps a seam note listing the downstream fact.ns tests", () => {
  assert.ok(seamStart >= 0 && seamEnd > seamStart, "the seam note is in study/resolve.mjs");
  assert.ok(bulletText, "README has an 'A study namespace' Extending bullet");
});

test("EXT-3: README's study-namespace recipe names every place the seam note lists", () => {
  const names = [...seam.matchAll(/`([\w.]+)`/g)].map(m => m[1]);
  const files = [...seam.matchAll(/\b([a-z]+\.mjs)\b/g)].map(m => m[1]);
  const want = [...new Set(["resolveFact", ...names, ...files])];
  const missing = want.filter(n => !bulletText.includes(n));
  assert.deepEqual(missing, [], `README bullet: ${bulletText}`);
});

test("EXT-3: README points at the seam note by a line number that is the note", () => {
  const m = bulletText.match(/resolve\.mjs:(\d+)/);
  assert.ok(m, "the bullet cites study/resolve.mjs:<line>");
  assert.match(resolveLines[Number(m[1]) - 1] ?? "", /The seam is not airtight/);
});
