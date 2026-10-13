/**
 * prompts-core-EXT-8 [declared]: npc-core.mjs wrote the sourceRules enum (["2014", "2024"]) three
 * times — in NPC_SPEC, in the features' shared `source` fields, and in the spellcasting feature.
 * A local RULES const now holds it and all three use it. Same values and default, no behaviour
 * change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normaliseNpc, normaliseFeature } from "../npc-core.mjs";

const src = readFileSync(new URL("../npc-core.mjs", import.meta.url), "utf8");

test("prompts-core-EXT-8: the sourceRules enum is written once, as a local RULES const", () => {
  const literal = /\[\s*"2014"\s*,\s*"2024"\s*\]/g;
  assert.equal((src.match(literal) ?? []).length, 1, "npc-core.mjs restates [\"2014\", \"2024\"]");
  assert.match(src, /^const RULES = Object\.freeze\(\[\s*"2014"\s*,\s*"2024"\s*\]\);$/m);
  assert.equal((src.match(/sourceRules: \{ type: T\.one\(RULES\), def: "2014" \}/g) ?? []).length, 3);
});

test("prompts-core-EXT-8: sourceRules still takes 2014 | 2024, defaults to 2014, refuses the rest", () => {
  const npc = { name: "ZZ", cr: 1 };
  const feats = [
    { featureType: "passive", featureName: "ZZ" },
    { featureType: "spellcasting", spellcastingClass: "wizard", spellcastingLevel: 3 }
  ];
  const n = normaliseNpc(npc);
  assert.equal(n.args.sourceRules, "2014");
  for (const f of feats) assert.equal(normaliseFeature(f).args.sourceRules, "2014", f.featureType);
  for (const r of ["2014", "2024"]) {
    assert.equal(normaliseNpc({ ...npc, sourceRules: r }).args.sourceRules, r);
    for (const f of feats) {
      const out = normaliseFeature({ ...f, sourceRules: r });
      assert.equal(out.args.sourceRules, r, f.featureType);
    }
  }
  for (const r of ["2025", 2014, ""]) {
    assert.ok(normaliseNpc({ ...npc, sourceRules: r }).errors.some(e => /sourceRules/.test(e)), String(r));
    for (const f of feats) {
      assert.ok(normaliseFeature({ ...f, sourceRules: r }).errors.some(e => /sourceRules/.test(e)), `${f.featureType} ${r}`);
    }
  }
});
