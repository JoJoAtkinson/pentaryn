/**
 * ties-ui-M2 (declared): `.pt-chip` was declared twice in styles/ties.css — once for the stance
 * chip (the dot plus its word) and again, much later, for the GM's filter/tab buttons. The later
 * rule won the cascade, so every stance chip picked up the button padding, border and pointer
 * cursor, and the @container (width < 480px) dot-only override no longer had the last word.
 *
 * Ruling: the filter/tab buttons are `pt-filter-chip` (with `pt-filter-chip-on` / `-quiet`); the
 * stance chip keeps `pt-chip` alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = f => readFileSync(ROOT + f, "utf8");

/** Top-level rules as [selectorList, body], comments stripped; @-blocks skipped whole. */
function topRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const head = src.slice(i, open).replace(/[\s\S]*[;}]/, "").trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    if (!head.startsWith("@")) out.push([head, src.slice(open + 1, j - 1)]);
    i = j;
  }
  return out;
}

test("ties-ui-M2: .pt-chip is declared once at top level, and it is the stance chip", () => {
  const chip = topRules(read("styles/ties.css")).filter(([sel]) =>
    sel.split(",").map(s => s.trim()).includes(".pentaryn-ties .pt-chip"));
  assert.equal(chip.length, 1, "one top-level .pt-chip rule");
  assert.doesNotMatch(chip[0][1], /cursor\s*:/, "the stance chip is not a button");
});

test("ties-ui-M2: the filter/tab buttons wear pt-filter-chip, never pt-chip", () => {
  for (const f of ["attributes-ui.mjs", "review-ui.mjs"]) {
    const src = read(f);
    assert.ok(!/<button[^>]*class="pt-chip\b/.test(src), `${f}: no button is a .pt-chip`);
    assert.ok(!src.includes('"pt-chip-on"'), `${f}: the on-state is pt-filter-chip-on`);
    assert.ok(/class="pt-filter-chip\b/.test(src), `${f}: buttons are .pt-filter-chip`);
  }
  const css = read("styles/ties.css");
  for (const cls of ["pt-filter-chip", "pt-filter-chip-on", "pt-filter-chip-quiet"])
    assert.match(css, new RegExp(`\\.pentaryn-ties \\.${cls} *\\{`), `${cls} is styled`);
});
