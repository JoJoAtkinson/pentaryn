/**
 * prompts-core-M13 [declared]: the LEGEND's "Bands: …" line was a hand copy of core/grid.mjs's
 * BANDS. It is now built from BANDS, so a band change cannot leave the legend stale. The oracle
 * pins today's literal byte for byte, so the gather text does not change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEGEND } from "../core/gather-text.mjs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const OLD = "Bands: touching 5 | reach 10 | close 15-30 | near 35-60 | far 65-150 | distant 155+.";

test("prompts-core-M13: the LEGEND Bands line equals the old literal", () => {
  const lines = LEGEND.split("\n");
  assert.equal(lines[2], OLD);   // oracle
  assert.equal(lines.filter(l => l.startsWith("Bands:")).length, 1);
});

test("prompts-core-M13: the Bands line is built from BANDS, not written by hand", () => {
  const src = read("core/gather-text.mjs");
  assert.doesNotMatch(src, /touching 5 \| reach 10/);
  assert.match(src, /\bBANDS\b/);
});
