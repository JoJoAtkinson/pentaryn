// [declared] EXT-3: the tray's multiplier labels (×0 ×¼ ×½ ×1 ×2) lived in tray.mjs as MULT_LABEL,
// apart from core.MULTIPLIERS — adding a multiplier to core would render an "undefined" option.
// They now live in core as a frozen MULTIPLIER_LABELS keyed by MULTIPLIERS, and the tray imports
// them. The rendered tray HTML is unchanged (test/golden/tray-html.json still pins it).
import * as core from "../core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("EXT-3: core exports a frozen MULTIPLIER_LABELS", () => {
  assert.equal(typeof core.MULTIPLIER_LABELS, "object");
  assert.equal(Object.isFrozen(core.MULTIPLIER_LABELS), true);
});

test("EXT-3: every multiplier has a label, and no label lacks a multiplier", () => {
  for (const m of core.MULTIPLIERS) {
    assert.equal(typeof core.MULTIPLIER_LABELS[m], "string", `no label for ×${m}`);
    assert.notEqual(core.MULTIPLIER_LABELS[m], "", `blank label for ×${m}`);
  }
  assert.deepEqual(Object.keys(core.MULTIPLIER_LABELS).sort(), core.MULTIPLIERS.map(String).sort());
});

test("EXT-3: the labels are the tray's ×0 ×¼ ×½ ×1 ×2", () => {
  assert.deepEqual(core.MULTIPLIERS.map(m => core.MULTIPLIER_LABELS[m]), ["×0", "×¼", "×½", "×1", "×2"]);
});

test("EXT-3: the tray takes its labels from core, not a local table", () => {
  const src = readFileSync(new URL("../tray.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bMULT_LABEL\b/);
  assert.match(src, /import \{[^}]*\bMULTIPLIER_LABELS\b[^}]*\} from "\.\/core\.mjs"/);
});
