/**
 * Final code review (ties-ui-EXT-5): hard-coded key lists repeated their label tables — the world
 * filter bar spelled `["all", "unknown", "pending", "failed"]` beside `FILTER_LABEL`, the world
 * tree's state tag was a three-rung ladder of literal keys, and the review panel's "was" rows spelled
 * `["title", "category", "skill", "dc"]` beside `FIELD_LABEL`.
 * Ruling [declared]: the lists are derived from their tables (`Object.keys(FILTER_LABEL)`, a new
 * `STATE_LABEL` for failed/pending/unknown, `Object.keys(FIELD_LABEL)`). Output unchanged: the
 * tables keep the old order, and every key stays a literal (S10's i18n rule).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANG } from "./fixtures/world.mjs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** The `{ k: "key", … }` body of `const NAME = Object.freeze({ … })` in `s`, as [k, key] pairs. */
function table(s, name) {
  const m = s.match(new RegExp(`const ${name} = Object\\.freeze\\(\\{([^}]*)\\}\\)`));
  assert.ok(m, `${name} table present`);
  return [...m[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map(([, k, v]) => [k, v]);
}

test("ties-ui-EXT-5 attributes-ui: the filter bar is built from FILTER_LABEL, in the old order", () => {
  const s = src("attributes-ui.mjs");
  assert.deepEqual(
    table(s, "FILTER_LABEL").map(([k]) => k),
    ["all", "unknown", "pending", "failed"],
    "chip order unchanged"
  );
  assert.ok(!/\[\s*"all",\s*"unknown",\s*"pending",\s*"failed"\s*\]/.test(s), "no hand-written filter list");
  assert.ok(s.includes("Object.keys(FILTER_LABEL)"), "filters derived from FILTER_LABEL");
  assert.ok(!s.includes("`PENTARYN_TIES.attributes.filter.${"), "no template-built filter key");
});

test("ties-ui-EXT-5 attributes-ui: the world state tag comes from STATE_LABEL", () => {
  const s = src("attributes-ui.mjs");
  const rows = table(s, "STATE_LABEL");
  assert.deepEqual(
    rows,
    ["failed", "pending", "unknown"].map(k => [k, `PENTARYN_TIES.attributes.state.${k}`]),
    "STATE_LABEL names each state's key literally"
  );
  for (const [, key] of rows) {
    assert.equal(typeof LANG[key], "string", `${key} in lang/en.json`);
    assert.equal(s.split(`"${key}"`).length - 1, 1, `${key} spelled once, in the table`);
  }
  assert.ok(!/class="pt-attr-tag pt-state-(failed|pending|unknown)"/.test(s), "no hand-written tag per state");
});

test("ties-ui-EXT-5 review-ui: the snapshot 'was' rows come from FIELD_LABEL", () => {
  const s = src("review-ui.mjs");
  assert.deepEqual(
    table(s, "FIELD_LABEL").map(([k]) => k),
    ["title", "category", "skill", "dc"],
    "row order unchanged"
  );
  assert.ok(!/\[\s*"title",\s*"category",\s*"skill",\s*"dc"\s*\]/.test(s), "no hand-written field list");
  assert.ok(s.includes("Object.keys(FIELD_LABEL)"), "fields derived from FIELD_LABEL");
  assert.ok(!s.includes("`PENTARYN_TIES.review.field.${"), "no template-built field key");
});
