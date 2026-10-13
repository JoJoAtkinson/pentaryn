/**
 * Final code review (ties-ui-EXT-13): the Inspect preview hard-coded the kind-study ladder — the
 * dice bench's odds list `[15, 20, 25]`, the top tier `25` (the player view's composed study, the
 * dice bench's "common knowledge" study, the Share switch's "held below the top tier" test) and the
 * pass threshold `>= 15` / `< 15` — while core/study.mjs owns `STUDY_RUNGS` and `STUDY_BASE_DC`.
 * Ruling [declared]: the odds list is `STUDY_RUNGS.filter(r => r > 0)` reversed, the top tier is
 * `Math.max(...STUDY_RUNGS)` and the pass threshold is `STUDY_BASE_DC`, all from known-core. Same
 * numbers today, so no table-visible change.
 *
 * Integration with ties-core ext-7 (defect wave 2, deployed): the pass threshold is ties-core's one
 * rule `kindPassed(tier)` from core/rules.mjs (itself read off STUDY_RUNGS), so preview-app.mjs asks
 * it instead of comparing against STUDY_BASE_DC by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld } from "./fixtures/world.mjs";

const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";

await bootWorld({
  actors: [
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" }, biography: { value: "<p>Grey hunters.</p>" } } } },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { kindOf: KIND } } },
  ],
});
const { STUDY_RUNGS, STUDY_BASE_DC } = await import("../known-core.mjs");
const { InspectPreview } = await import("../preview-app.mjs");

const src = readFileSync(new URL("../preview-app.mjs", import.meta.url), "utf8");

test("ties-ui-EXT-13 the ladder constants are the numbers the preview showed", () => {
  assert.deepEqual(STUDY_RUNGS, [25, 20, 15, 0]);
  assert.equal(STUDY_BASE_DC, 15);
});

test("ties-ui-EXT-13 the dice bench's odds follow STUDY_RUNGS", async () => {
  const saved = [...STUDY_RUNGS];
  try {
    STUDY_RUNGS.splice(0, STUDY_RUNGS.length, 30, 20, 15, 0); // a GM-facing ladder change, in place
    const pv = Object.assign(new InspectPreview(game.actors.get(NPC)), { mode: "simulate" });
    const sim = await pv.simulate();
    assert.ok(sim.kind && !sim.kind.none && !sim.kind.auto, "the kind study is rolled");
    assert.deepEqual(sim.kind.odds.map(o => o.t), [15, 20, 30], "odds list is the positive rungs, lowest first");
  } finally {
    STUDY_RUNGS.splice(0, STUDY_RUNGS.length, ...saved);
  }
});

test("ties-ui-EXT-13 no study-ladder literal is left in preview-app.mjs", () => {
  assert.ok(
    /import\s*\{[^}]*\bSTUDY_RUNGS\b[^}]*\}\s*from\s*"\.\/known-core\.mjs"/.test(src) &&
      /import\s*\{[^}]*\bkindPassed\b[^}]*\}\s*from\s*"\.\/core\/rules\.mjs"/.test(src),
    "preview-app.mjs imports STUDY_RUNGS from known-core and kindPassed (ext-7) from core/rules.mjs"
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\[\s*15\s*,\s*20\s*,\s*25\s*\]/, "no literal odds list");
  assert.doesNotMatch(code, /composeStudyPayload\([^)]*,\s*25\s*,/, "no literal top tier handed to composeStudyPayload");
  assert.doesNotMatch(code, /tier\s*(>=|<)\s*15\b/, "no literal pass threshold");
  assert.doesNotMatch(code, /tier\s*(>=|<)\s*STUDY_BASE_DC\b/, "the pass threshold is kindPassed, not a hand comparison");
  assert.match(code, /kindPassed\(k\.tier\)/, "the dice bench asks kindPassed");
  assert.doesNotMatch(code, /<\s*25\b/, "no literal top-tier comparison");
});
