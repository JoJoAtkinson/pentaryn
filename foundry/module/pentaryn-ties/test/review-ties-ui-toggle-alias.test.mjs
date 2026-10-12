/**
 * Final code review (ties-ui-M6): overlay.mjs kept `export const toggle = showAll` as a 0.3.0 alias
 * "for anything that imported this module directly". A repo grep finds no importer — the entry
 * imports `* as overlay` and binds `showWeb` to `overlay.showAll()`, the API rows (show, showAll,
 * cards) bind straight to it.
 * Ruling: drop the alias; the API rows stay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("ties-ui-M6: overlay.mjs no longer exports the `toggle` alias", () => {
  assert.ok(!/^export\s+const\s+toggle\b/m.test(src("overlay.mjs")), "overlay.mjs still exports `toggle`");
});

test("ties-ui-M6: showAll is still exported and the entry still binds it", () => {
  assert.ok(/^export\s+(async\s+)?function\s+showAll\b/m.test(src("overlay.mjs")), "overlay.mjs exports showAll");
  assert.ok(/overlay\.showAll\(\)/.test(src("pentaryn-ties.mjs")), "the entry binds overlay.showAll");
});
