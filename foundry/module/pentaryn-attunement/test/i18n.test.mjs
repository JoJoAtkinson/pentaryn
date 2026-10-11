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
