/**
 * S10's rule for template-built i18n keys: a literal map in the owning file, so a definite-reference
 * scan sees every key. ties-44 added two families built only from a template (review hold state,
 * preview proficiency); they now have HOLD_LABEL / PROF_LABEL. Review finding, wave 3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANG } from "./fixtures/world.mjs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

for (const [file, family, keys] of [
  ["review-ui.mjs", "review.hold", ["held", "notHeld", "default"]],
  ["preview-app.mjs", "preview.prof", ["none", "prof", "expert"]],
]) {
  test(`${file}: every PENTARYN_TIES.${family}.* key is named literally, none built from a template`, () => {
    const s = src(file);
    for (const k of keys) {
      const key = `PENTARYN_TIES.${family}.${k}`;
      assert.equal(typeof LANG[key], "string", `${key} in lang/en.json`);
      assert.ok(s.includes(`"${key}"`), `${key} literal in ${file}`);
    }
    assert.ok(!s.includes(`\`PENTARYN_TIES.${family}.\${`), `no template-built ${family} key in ${file}`);
  });
}
