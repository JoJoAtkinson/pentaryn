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

test("M8: one skill-label lookup and one flat-row grade closure across study/", () => {
  for (const f of ["resolve.mjs", "cascade.mjs", "request.mjs", "apply.mjs", "share.mjs", "gate.mjs", "authoring.mjs"])
    assert.equal(count(src(`study/${f}`), /CONFIG\.DND5E\?\.skills\?\.\[/g), 0, `${f} pastes the skill-label lookup`);
  assert.equal(count(src("study/shared.mjs"), /CONFIG\.DND5E\?\.skills\?\.\[/g), 1, "skillLabelOf is the one copy");
  const r = src("study/resolve.mjs");
  assert.equal(count(r, /loreOutcome\(row, total\)/g), 1, "the lore and attr branches share loreGrade");
  assert.equal(count(r, /grade: loreGrade\(row\)/g), 2);
});

test("EXT-8: the attribute and individual offered rows come from one offeredRow mapper", () => {
  const q = src("study/request.mjs");
  assert.match(q, /^function offeredRow\(/m);
  assert.equal(count(q, /available: !spent/g), 1, "one copy of the row shape");
  assert.equal(count(q, /offeredRow\(row, !!spent\[/g), 2, "both state readers call it");
});
