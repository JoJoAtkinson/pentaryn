// i18n (guide step 1.7, items-journal-14): every string key the source passes to t() — directly, or as
// warnOverCap's key argument — exists in the module's STRINGS table. (From step 9, lang/en.json parity.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceFiles, sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

function stringsKeys() {
  const keys = new Set();
  for (const rel of sourceFiles(ROOT)) {
    const src = readFileSync(new URL(rel, ROOT), "utf8");
    const m = /const STRINGS = \{([\s\S]*?)\n\};/.exec(src);
    if (m) for (const k of m[1].matchAll(/^\s*(\w+):/gm)) keys.add(k[1]);
  }
  return keys;
}

test("every t(\"Key\") and warnOverCap(…, \"Key\") literal is a STRINGS key", () => {
  const keys = stringsKeys();
  const used = new Set();
  for (const hit of sourceScan(ROOT, /\bt\("\w+"/)) for (const m of hit.text.matchAll(/\bt\("(\w+)"/g)) used.add(m[1]);
  for (const hit of sourceScan(ROOT, /warnOverCap\([^)]*"\w+"\)/)) for (const m of hit.text.matchAll(/warnOverCap\([^)]*"(\w+)"\)/g)) used.add(m[1]);
  assert.ok(used.size >= 10, `found ${used.size} keys`);
  for (const k of used) assert.ok(keys.has(k), `${k} is not in STRINGS`);
});

// Wave 7 batch (guide step 9): module.json `languages` names lang/en.json, whose values are byte-identical
// to STRINGS. The file is INERT until step 8 switches the t() sites to _loc (declared, a reload then, no
// restart); nothing reads a PENTARYN_ATTUNEMENT.* key yet, so no player can see a raw key.
test("lang/en.json is STRINGS verbatim under PENTARYN_ATTUNEMENT, and languages names it", async () => {
  const { STRINGS, I18N } = await import("../attunement-core.mjs");
  const manifest = JSON.parse(readFileSync(new URL("module.json", ROOT), "utf8"));
  assert.deepEqual(manifest.languages, [{ lang: "en", name: "English", path: "lang/en.json" }]);
  assert.deepEqual(JSON.parse(readFileSync(new URL("lang/en.json", ROOT), "utf8")), { [I18N]: STRINGS });
  assert.deepEqual(sourceScan(ROOT, /["'`]PENTARYN_ATTUNEMENT\.|game\.i18n\.\w+\(\s*["'`]PENTARYN|_loc\(/), []);
});
