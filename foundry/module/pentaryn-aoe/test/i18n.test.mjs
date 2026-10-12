// i18n (S3): lang/en.json is nested under PENTARYN_AOE, every literal key in the code exists, the
// one template-built key family is listed and proved, and no prefix wrapper is left.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readJSON, sourceFiles, sourceScan } from "./kit/harness.mjs";
import { I18N } from "../core.mjs";
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

/** Keys built at runtime from a template, expanded here so each is proved (tray.mjs status line). */
const TEMPLATE_KEYS = ["waiting", "applied", "superseded"].map(s => `${I18N}.Status.${s}`);

test("lang/en.json is nested under one root", () => {
  assert.deepEqual(Object.keys(lang), [I18N]);
});

test("every SETTINGS row has literal name and hint keys that exist; choices too", () => {
  for (const row of SETTINGS) {
    for (const field of ["name", "hint"]) {
      assert.equal(typeof row[field], "string", `${row.key}.${field} must be a literal`);
      assert.ok(row[field] in keys, `${row[field]} missing from lang/en.json`);
    }
    for (const v of Object.values(row.choices ?? {})) assert.ok(v in keys, v);
  }
});

test("every literal PENTARYN_AOE key in the code exists in lang/en.json", () => {
  const used = new Set();
  for (const file of sourceFiles(ROOT)) {
    const src = readFileSync(new URL(file, ROOT), "utf8");
    for (const m of src.matchAll(/["'`](PENTARYN_AOE\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 40, `${used.size} literal keys found`);
  for (const key of used) assert.ok(key in keys, `${key} missing from lang/en.json`);
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
