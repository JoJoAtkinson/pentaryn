// i18n: every literal label key exists, and no key is built where the i18n gate cannot see it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { CATEGORIES, I18N } from "../feedback-core.mjs";
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

/** Keys built at runtime from a template (`${I18N}.kind.${k}`), expanded here so each is proved. None: every key is a literal. */
const TEMPLATE_KEYS = [];

/** The module's own .mjs source (not lib/, not test/), concatenated. */
const SOURCE = readdirSync(ROOT).filter(f => f.endsWith(".mjs")).map(f => readFileSync(new URL(f, ROOT), "utf8")).join("\n");

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

test("the three category help texts are exactly the sentences players see on hover", () => {
  const help = Object.fromEntries(CATEGORIES.map(c => [c.key, keys[c.help]]));
  assert.deepEqual(help, {
    bug: "It is just broken. If you don't know which to pick, Bug is a good default.",
    defect: "It works, just not the way you expect, so it comes across as a bug. If you don't know, pick Bug.",
    feature: "100% new: it does not exist yet, like a new tab or a new subsystem.",
  });
  assert.deepEqual(CATEGORIES.map(c => keys[c.label]), ["Bug", "Defect", "Feature"]);
});

test("every lang key is used as a literal in the module source, and every literal exists", () => {
  for (const key of Object.keys(keys)) assert.ok(SOURCE.includes(`"${key}"`), `${key} is never used`);
  for (const [, key] of SOURCE.matchAll(/"(PENTARYN_FEEDBACK\.[A-Za-z0-9_.]+)"/g)) assert.ok(key in keys, `${key} missing from lang/en.json`);
});

test("format placeholders in the notices match what the code passes", () => {
  assert.match(keys["PENTARYN_FEEDBACK.Notify.Saved"], /\{id\}/);
  assert.match(keys["PENTARYN_FEEDBACK.Notify.Queued"], /\{id\}/);
  assert.match(keys["PENTARYN_FEEDBACK.Notify.Filed"], /\{user\}.*\{category\}.*\{id\}/);
  assert.match(keys["PENTARYN_FEEDBACK.Notify.Dropped"], /\{n\}/);
});
