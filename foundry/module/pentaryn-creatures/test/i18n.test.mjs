// i18n (guide step 3): every SETTINGS row's literal label keys exist, the strip's two literal keys
// exist, and no key is built where the i18n gate cannot see it (the old `L` prefix wrapper is gone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { I18N } from "../creatures-core.mjs";
import { SETTINGS } from "../settings.mjs";

const ROOT = new URL("..", import.meta.url);

function flatten(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const lang = readJSON(new URL("lang/en.json", ROOT));
const keys = flatten(lang);

test("lang/en.json is nested under one root", () => {
  assert.deepEqual(Object.keys(lang), [I18N]);
});

test("every SETTINGS row has literal name and hint keys that exist", () => {
  assert.deepEqual(SETTINGS.map(r => r.key), ["lightRadius", "ownerSees", "floatOverHud", "showStrip"]);
  for (const row of SETTINGS) {
    for (const field of ["name", "hint"]) {
      assert.equal(row[field], `${I18N}.settings.${row.key}.${field}`, `${row.key}.${field} keeps its key`);
      assert.ok(row[field] in keys, `${row[field]} missing from lang/en.json`);
    }
  }
});

test("the strip's literal keys exist, and every _loc literal in the sources resolves", () => {
  const literals = sourceScan(ROOT, /_loc\(\s*"([^"]+)"/);
  assert.ok(literals.length >= 3, "label (twice) and hint");
  for (const hit of literals) {
    const key = /_loc\(\s*"([^"]+)"/.exec(hit.text)?.[1];
    assert.ok(key in keys, key);
  }
});

test("no prefix wrapper: keys are full literals through _loc (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
  ];
  assert.deepEqual(hits, []);
});
