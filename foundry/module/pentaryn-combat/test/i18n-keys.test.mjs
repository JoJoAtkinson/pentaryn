// Guide S4: the template-built i18n keys became literal tables (core.I18N_KEYS) read through keyFor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANG } from "./fixtures/world.mjs";
import * as core from "../combat-core.mjs";

const flat = {};
(function walk(node, prefix) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") walk(v, key); else flat[key] = v;
  }
})(LANG, "");
const has = k => typeof flat[k] === "string";

test("S4 literal key tables: every I18N_KEYS value exists; keyFor equals the old template string for every value, known or not", () => {
  for (const [family, table] of Object.entries(core.I18N_KEYS)) {
    for (const [value, key] of Object.entries(table)) {
      assert.ok(has(key), key);
      assert.equal(key, `PENTARYN_COMBAT.${family}.${value}`);
      assert.equal(core.keyFor(family, value), key);
    }
  }
  assert.equal(core.keyFor("FollowUp", "unknown-kind"), ["PENTARYN_COMBAT", "FollowUp", "unknown-kind"].join("."));   // built: not a lang key
  assert.equal(core.keyFor("Kind", undefined), ["PENTARYN_COMBAT", "Kind", "undefined"].join("."));
});
