// i18n: every literal label key exists, and no key is built where the i18n gate cannot see it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { I18N } from "../feedback-core.mjs";
import { KEYBINDINGS, SETTINGS } from "../settings.mjs";

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

/** Keys built at runtime from a template (`${I18N}.kind.${k}`), expanded here so each is proved. */
const TEMPLATE_KEYS = [];

test("lang/en.json is nested under one root", () => {
  assert.deepEqual(Object.keys(lang), [I18N]);
});

test("every SETTINGS/KEYBINDINGS row has literal name and hint keys that exist", () => {
  for (const row of [...SETTINGS.filter(r => !r.store), ...KEYBINDINGS]) {
    for (const field of ["name", "hint"]) {
      assert.equal(typeof row[field], "string", `${row.key}.${field} must be a literal`);
      assert.ok(row[field] in keys, `${row[field]} missing from lang/en.json`);
    }
    if (row.choices && !Array.isArray(row.choices)) {
      for (const v of Object.values(row.choices)) if (typeof v === "string" && v.startsWith(`${I18N}.`)) assert.ok(v in keys, v);
    }
  }
});

test("template-built keys exist", () => {
  for (const key of TEMPLATE_KEYS) assert.ok(key in keys, key);
});

test("no prefix wrapper: keys are full literals through _loc (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
  ];
  assert.deepEqual(hits, []);
});
