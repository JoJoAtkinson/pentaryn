/**
 * R7 [declared] (final review ties-core, 2026-10-12; defect wave 2): a study tier whose `min` is
 * missing — null, "", false or [] — is dropped, not read as rung 0. The untyped `num` read
 * `Number(null | "" | false | [])` as 0, so a half-written tier row was delivered as the failure
 * text. M1's typed `num` already fixed it; this pins it.
 * Pure core; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { authoredTier, readStudyTiers } from "../core/study.mjs";

test("R7: a tier with a null, blank, false or empty-array min is dropped, not filed as rung 0", () => {
  for (const min of [null, undefined, "", "   ", false, []]) {
    const tiers = readStudyTiers([{ min, text: "A half-written row." }]);
    assert.deepEqual(tiers, [], `min ${JSON.stringify(min)}`);
    assert.equal(authoredTier(tiers, 0), "", `min ${JSON.stringify(min)}: not the rung-0 failure text`);
  }
});

test("R7: a null-min row does not take the rung-0 slot from the real failure text", () => {
  const tiers = readStudyTiers([
    { min: null, text: "A half-written row." },
    { min: 0, text: "It is a harmless bird." },
    { min: 25, text: "It is not a bird at all." },
  ]);
  assert.deepEqual(tiers.map(x => x.min), [25, 0]);
  assert.equal(authoredTier(tiers, 0), "It is a harmless bird.");
  assert.ok(!tiers.some(x => x.text === "A half-written row."));
  assert.equal(readStudyTiers([{ min: 0, text: "A real miss." }])[0].min, 0, "a real 0 is still rung 0");
});
