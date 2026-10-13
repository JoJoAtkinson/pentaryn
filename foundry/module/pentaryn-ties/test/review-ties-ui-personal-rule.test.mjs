/**
 * Final code review (ties-ui-EXT-6): the "is this a Personal attribute?" rule (category trimmed,
 * lowercased, === "personal") was spelled by hand in two UI files — review-ui.mjs (which tab a row
 * sits under) and attributes-ui.mjs (whether to draw "Clues on <carrier>") — and absent from core.
 * Ruling [declared]: one pure `isPersonalEntry(entry)` in core/rules.mjs; both UI files call it.
 * Same verdicts as before, so no table-visible change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as rules from "../core/rules.mjs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** The verbatim rule both UI files used before the fix. */
const legacy = e => String(e?.category ?? "").trim().toLowerCase() === "personal";

test("ties-ui-EXT-6 core/rules: isPersonalEntry is the trimmed, case-blind 'personal' test", () => {
  const { isPersonalEntry } = rules;
  assert.equal(typeof isPersonalEntry, "function", "core/rules.mjs exports isPersonalEntry");
  const CASES = [
    [{ category: "personal" }, true],
    [{ category: "Personal" }, true],
    [{ category: "  PERSONAL \n" }, true],
    [{ category: "person" }, false],
    [{ category: "personal history" }, false],
    [{ category: "world" }, false],
    [{ category: "" }, false],
    [{ category: null }, false],
    [{}, false],
    [null, false],
    [undefined, false]
  ];
  for (const [entry, want] of CASES) {
    assert.equal(isPersonalEntry(entry), want, JSON.stringify(entry ?? String(entry)));
    assert.equal(isPersonalEntry(entry), legacy(entry), "same verdict as the old inline rule");
  }
});

test("ties-ui-EXT-6 review-ui and attributes-ui call isPersonalEntry, not their own copy", () => {
  for (const f of ["review-ui.mjs", "attributes-ui.mjs"]) {
    const s = src(f);
    assert.ok(/import\s*\{[^}]*\bisPersonalEntry\b[^}]*\}\s*from\s*"\.\/core\/rules\.mjs"/.test(s), `${f} imports isPersonalEntry`);
    assert.ok(s.includes("isPersonalEntry("), `${f} calls isPersonalEntry`);
    assert.ok(!/toLowerCase\(\)\s*[!=]==\s*"personal"/.test(s), `${f} has no hand-written personal rule`);
  }
});
