// i18n (guide step 1.8; tier full requires the file). The importer is console/toast-only by design
// (C36 note: its English toast text is pinned verbatim in glue.test), so there is nothing to localise:
// no lang/ folder, no `languages` in module.json, no localisation call and no localisation key literal.
// A bare constant such as the blueprint's `I18N = "PENTARYN_IMPORTER"` (guide step 2) is not a key use;
// a key is `PENTARYN_…` followed by a dot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { manifestOf, sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("no lang/ folder and no languages in module.json", () => {
  assert.equal(existsSync(new URL("lang", ROOT)), false);
  assert.equal("languages" in manifestOf(ROOT), false);
});

test("no localisation calls and no PENTARYN_ key literals in the module's sources", () => {
  assert.deepEqual(sourceScan(ROOT, /game\.i18n\.|\b_loc\(/), []);
  assert.deepEqual(sourceScan(ROOT, /PENTARYN_[A-Z0-9_]*\./), []);
});
