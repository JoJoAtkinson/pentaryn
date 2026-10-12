/**
 * ext-7 [declared] (final review ties-core, 2026-10-12; defect wave 2): the kind study's pass rung
 * was a hand-written `>= 15` at nine sites (prose, facts, share, resolve, gate, authoring and three in
 * the preview). It is one rule now — `kindPassed(tier)` in core/rules.mjs, read off STUDY_RUNGS'
 * lowest success rung — and the sites call it. Behaviour identical; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kindPassed } from "../core/rules.mjs";
import { STUDY_RUNGS } from "../core/study.mjs";
import { sourceScan } from "./kit/harness.mjs";

const TIERS = [25, 20, 15, 14.9, 0, -5, "15", "20", "14", "", " ", "abc", null, undefined, NaN, Infinity, -Infinity, true, false, [], [15], {}];

test("ext-7: kindPassed is Number(tier) >= the lowest success rung of STUDY_RUNGS (15)", () => {
  assert.equal(typeof kindPassed, "function");
  const rung = Math.min(...STUDY_RUNGS.filter(r => r > 0));
  assert.equal(rung, 15);
  for (const t of TIERS) {
    // the verbatim expression the nine sites carried
    assert.equal(kindPassed(t), Number(t) >= 15, JSON.stringify(t) ?? String(t));
    assert.equal(kindPassed(t), Number(t) >= rung);
  }
});

test("ext-7: kindPassed agrees with the preview's bare `tier >= 15` and `tier < 15` on every tier tierOf returns", () => {
  for (const t of [...STUDY_RUNGS, null]) {
    assert.equal(kindPassed(t), t >= 15, String(t));
    assert.equal(!kindPassed(t), t < 15, String(t));
  }
});

test("ext-7: no module file compares a tier with a hand-written 15", () => {
  const hits = sourceScan(new URL("..", import.meta.url), /tier\)?\s*(?:>=|<)\s*15\b/);
  assert.deepEqual(hits, []);
});
