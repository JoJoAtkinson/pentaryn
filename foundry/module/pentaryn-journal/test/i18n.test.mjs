// i18n (guide step 1.7): every literal PENTARYN_JOURNAL.* key in the source exists in lang/en.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const flat = (node, prefix = "", out = new Set()) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out.add(key);
  }
  return out;
};

test("every literal PENTARYN_JOURNAL.* key exists in lang/en.json", () => {
  const keys = flat(readJSON(new URL("lang/en.json", ROOT)));
  const used = new Set();
  for (const hit of sourceScan(ROOT, /PENTARYN_JOURNAL\.[\w.]+/)) {
    for (const m of hit.text.matchAll(/PENTARYN_JOURNAL\.[\w.]*\w/g)) used.add(m[0]);
  }
  assert.ok(used.size >= 20, `found ${used.size}`);
  for (const k of used) assert.ok(keys.has(k), k);
});
