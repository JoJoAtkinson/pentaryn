// [declared] EXT-3: the claim keys are named once in the core (COIN_CLAIM, HOME_CLAIM), and bonds.mjs
// and actor-adapter.mjs build every flag update path with the kit's flagPath(MODULE, …), never a
// hand-written `flags.${…}` template beside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as core from "../attunement-core.mjs";

/** A source file with its comments stripped, so prose may still name the keys. */
const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$|\s\/\/ .*$/gm, "");

test("[declared] EXT-3: the core names the claim keys", () => {
  assert.equal(core.COIN_CLAIM, "coinBack");
  assert.equal(core.HOME_CLAIM, "home");
});

for (const f of ["bonds.mjs", "actor-adapter.mjs"]) {
  test(`[declared] EXT-3: ${f} builds flag paths with flagPath, not by hand`, () => {
    assert.deepEqual(src(f).match(/`flags\.\$\{[^`]*`/g) ?? [], []);
  });
}

test("[declared] EXT-3: bonds.mjs uses the claim constants, not bare literals", () => {
  assert.deepEqual(src("bonds.mjs").match(/["'`.](coinBack|home)["'`]|\.coinBack\b/g) ?? [], []);
});
