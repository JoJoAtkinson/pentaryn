// i18n (guide S3, finding -21 / C35): every literal label key exists in lang/en.json, and no key is
// built from a template where the i18n gate cannot see it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import * as core from "../movement-core.mjs";
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
  assert.deepEqual(Object.keys(lang), [core.I18N]);
});

test("every key in the core maps exists", () => {
  const maps = [core.TOOL_KEYS, core.TOOL_CLIP_KEYS, core.GM_KEYS, core.GM_CLIP_KEYS,
    core.NOTIFY_BLOCKED, core.NOTIFY_CLEARED, core.NOTIFY_BACK];
  for (const m of maps) for (const key of Object.values(m)) assert.ok(key in keys, key);
});

test("every SETTINGS label and choice key that is set exists", () => {
  for (const row of SETTINGS) {
    for (const field of ["name", "hint"]) if (row[field] !== undefined) assert.ok(row[field] in keys, `${row.key}.${field}`);
    for (const v of Object.values(row.choices ?? {})) assert.ok(v in keys, v);
  }
  const policy = SETTINGS.find(r => r.key === "ghostPolicy");
  assert.deepEqual(Object.keys(policy.choices), [...core.POLICIES]);
});

test("no template-built PENTARYN_MOVEMENT key and no prefix wrapper in the sources", () => {
  assert.deepEqual(sourceScan(ROOT, /`PENTARYN_MOVEMENT\.[^`]*\$\{/), []);
  assert.deepEqual(sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/), []);
});
