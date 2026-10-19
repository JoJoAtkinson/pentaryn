// i18n (guide step 1.8; tier full requires the file). The NPC import is console/toast-only by design
// (C36 note: its English toast text is pinned verbatim in glue.test). Since 1.2.0 the one setting
// (ddbCorrections) has labels in lang/en.json; those literal keys in settings.mjs are the only ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, readJSON, sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const flat = (node, prefix = "", out = new Set()) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out.add(key);
  }
  return out;
};

test("languages names lang/en.json, nested under PENTARYN_IMPORTER", () => {
  assert.deepEqual(manifestOf(ROOT).languages, [{ lang: "en", name: "English", path: "lang/en.json" }]);
  assert.deepEqual(Object.keys(readJSON(new URL("lang/en.json", ROOT))), ["PENTARYN_IMPORTER"]);
});

test("every literal PENTARYN_IMPORTER.* key exists in lang/en.json, and every lang key is used", () => {
  const keys = flat(readJSON(new URL("lang/en.json", ROOT)));
  const used = new Set();
  for (const hit of sourceScan(ROOT, /PENTARYN_IMPORTER\.[\w.]+/)) {
    for (const m of hit.text.matchAll(/PENTARYN_IMPORTER\.[\w.]*\w/g)) used.add(m[0]);
  }
  assert.deepEqual([...used].sort(), [...keys].sort());
});

test("no localisation calls: the import's toasts and console lines stay English literals", () => {
  assert.deepEqual(sourceScan(ROOT, /game\.i18n\.|\b_loc\(/), []);
});
