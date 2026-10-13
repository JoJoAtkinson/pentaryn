/**
 * senses-M9 [declared] (final review 2026-10-12): light.mjs's install() hands light-ui.mjs only the
 * actions the UI calls. `cast` was bound in but nothing in light-ui.mjs ever called it (the UI
 * reaches a cast through onMe and pickAndCast), so it is dropped from bindActions and from the
 * comment that lists the bound actions. No behaviour change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bound = src => {
  const m = src.match(/bindActions\(\{([^}]*)\}\)/);
  assert.ok(m, "light.mjs calls bindActions({ ... })");
  return m[1].split(",").map(s => s.trim()).filter(Boolean);
};

test("senses-M9: light.mjs does not bind cast into light-ui", () => {
  assert.ok(!bound(read("light.mjs")).includes("cast"), "cast is bound into light-ui");
});

test("senses-M9: every action bound into light-ui is one light-ui uses", () => {
  const ui = read("light-ui.mjs");
  const LIGHT_ACTIONS_HANDLERS = [...ui.matchAll(/handler: "(\w+)"/g)].map(m => m[1]);
  for (const name of bound(read("light.mjs"))) {
    const used = LIGHT_ACTIONS_HANDLERS.includes(name) || new RegExp(`actions\\.${name}\\(`).test(ui);
    assert.ok(used, `light-ui.mjs never calls the bound action "${name}"`);
  }
});

test("senses-M9: light-ui.mjs's comment lists exactly the bound actions", () => {
  const m = read("light-ui.mjs").match(/\/\*\* light\.mjs's actions: \{([^}]*)\}\. \*\//);
  assert.ok(m, "light-ui.mjs documents the bound actions");
  const listed = m[1].split(",").map(s => s.trim()).filter(Boolean);
  assert.deepEqual(listed, bound(read("light.mjs")));
});
