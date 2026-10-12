/**
 * Final code review (ties-ui-M5): four re-exports nobody imports, and popups.mjs importing
 * ties-adapter.mjs twice. worn.mjs re-exported WORN_FLAG/readWorn, popups.mjs PIN_SETTING,
 * tie-dialog.mjs baseActorOf and review-ui.mjs SELECTION_FLAG — every caller takes them from
 * their home (ties-adapter.mjs, settings.mjs, attributes.mjs) instead.
 * Ruling: drop the four re-exports and merge the two ties-adapter imports into one line. The
 * public API (api-manifest) is untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** Names a file re-exports with a bare `export { … }` (no declaration). */
const reexported = text => [...text.matchAll(/^export\s*\{([^}]*)\}/gm)]
  .flatMap(m => m[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()).filter(Boolean));

test("ties-ui-M5: the four unused re-exports are gone", () => {
  const cases = { "worn.mjs": ["WORN_FLAG", "readWorn"], "popups.mjs": ["PIN_SETTING"],
    "tie-dialog.mjs": ["baseActorOf"], "review-ui.mjs": ["SELECTION_FLAG"] };
  for (const [file, names] of Object.entries(cases)) {
    const out = reexported(src(file));
    for (const n of names) assert.ok(!out.includes(n), `${file} no longer re-exports ${n}`);
  }
});

test("ties-ui-M5: popups.mjs imports ties-adapter.mjs once", () => {
  const lines = src("popups.mjs").split("\n").filter(l => /^import .* from "\.\/ties-adapter\.mjs";/.test(l));
  assert.equal(lines.length, 1, lines.join("\n"));
});
