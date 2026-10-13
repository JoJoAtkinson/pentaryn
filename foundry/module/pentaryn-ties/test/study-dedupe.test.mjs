/**
 * The final review's deferred-at-the-cap refactors (2026-10-12, ties-study), landed in defect
 * wave 2: each one replaces a copied rule with one source. The goldens pin that behaviour is
 * unchanged; this file pins the shape, so the copies cannot creep back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const count = (text, re) => (text.match(re) ?? []).length;

test("M6: each tempo rung names its i18n key once", () => {
  const t = src("study/tempo.mjs");
  const rows = t.slice(t.indexOf("const SCOPE_STEPS"), t.indexOf("];", t.indexOf("const SCOPE_STEPS")));
  assert.equal(count(rows, /\{ at: \d+, label: "PENTARYN_TIES\.known\.inspect\.scope\d+" \}/g), 4);
  assert.doesNotMatch(rows, /\bkey:/, "no short-key copy beside the full label");
});

test("M7: the kind descriptor reads the offset flag once for offset and dc", () => {
  const r = src("study/resolve.mjs");
  const kind = r.slice(r.indexOf('if (ns === "kind")'), r.indexOf("grade: async total"));
  assert.equal(count(kind, /readFlag\(kind, MODULE, STUDY_OFFSET_FLAG\)/g), 1);
});
