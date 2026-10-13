/**
 * Final code review (ties-ui-EXT-7): the DC inputs hard-coded their band — the Attributes tab's
 * identify DC (`min="1" max="40"`, default `?? 15`) and the review panel's entry and lore-row DCs
 * (`min="1" max="40"`) — while core/lore.mjs owns `LORE_DC_MIN / LORE_DC_MAX / LORE_DC_DEFAULT`
 * and lore-ui.mjs already used them. A change to the band would have left these inputs behind.
 * Ruling [declared]: every DC input takes its min, max and default from those constants (via
 * known-core). Same numbers today, so no table-visible change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LORE_DC_MIN, LORE_DC_MAX, LORE_DC_DEFAULT } from "../known-core.mjs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** Every `<input type="number" … data-…field="dc" …>` tag in `s`. */
const dcInputs = s => [...s.matchAll(/<input type="number"[^>]*data-[\w-]*field="dc"[^>]*>/g)].map(m => m[0]);

test("ties-ui-EXT-7 the DC band constants are the numbers the inputs showed", () => {
  assert.equal(LORE_DC_MIN, 1);
  assert.equal(LORE_DC_MAX, 40);
  assert.equal(LORE_DC_DEFAULT, 15);
});

test("ties-ui-EXT-7 every DC input takes min/max from LORE_DC_MIN / LORE_DC_MAX", () => {
  for (const f of ["attributes-ui.mjs", "review-ui.mjs", "lore-ui.mjs"]) {
    const s = src(f);
    const tags = dcInputs(s);
    assert.ok(tags.length > 0, `${f} has a DC input`);
    for (const t of tags) {
      assert.ok(t.includes('min="${LORE_DC_MIN}"'), `${f}: ${t} uses LORE_DC_MIN`);
      assert.ok(t.includes('max="${LORE_DC_MAX}"'), `${f}: ${t} uses LORE_DC_MAX`);
      assert.ok(!/\b(min|max)="\d+"/.test(t), `${f}: ${t} has no literal bound`);
    }
    if (f !== "lore-ui.mjs") {
      assert.ok(
        /import\s*\{[^}]*\bLORE_DC_MIN\b[^}]*\}\s*from\s*"\.\/known-core\.mjs"/.test(s) &&
          /import\s*\{[^}]*\bLORE_DC_MAX\b[^}]*\}\s*from\s*"\.\/known-core\.mjs"/.test(s),
        `${f} imports the DC band from known-core`
      );
    }
  }
});

test("ties-ui-EXT-7 the identify DC defaults to LORE_DC_DEFAULT, not a literal 15", () => {
  const s = src("attributes-ui.mjs");
  const [tag] = dcInputs(s);
  assert.ok(tag.includes("row.dc ?? LORE_DC_DEFAULT"), `identify DC default: ${tag}`);
  assert.ok(!/\?\?\s*15\b/.test(s), "no literal 15 fallback");
  assert.ok(/import\s*\{[^}]*\bLORE_DC_DEFAULT\b[^}]*\}\s*from\s*"\.\/known-core\.mjs"/.test(s));
});
