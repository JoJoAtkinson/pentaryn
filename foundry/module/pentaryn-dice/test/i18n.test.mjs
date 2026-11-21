// i18n: every literal key resolves, the setting and keybinding labels are pinned, and no prefix wrapper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { I18N } from "../dice-core.mjs";
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

test("one root, PENTARYN_DICE", () => {
  assert.deepEqual(Object.keys(lang), [I18N]);
});

test("every setting and keybinding row's name/hint is a literal key present in lang/en.json", () => {
  for (const row of [...SETTINGS, ...KEYBINDINGS]) {
    for (const k of ["name", "hint"]) assert.ok(row[k] in keys, `${row.key}.${k}: ${row[k]}`);
  }
  assert.equal(keys[`${I18N}.Keybind.selectAll.Name`], "Select all my dice");
  assert.equal(keys[`${I18N}.Sidebar.spawn`], "+ ×");
});

test("every PENTARYN_DICE.* literal in the sources exists in lang/en.json", () => {
  const used = sourceScan(ROOT, /["'`]PENTARYN_DICE\.[\w.]+["'`]/)
    .flatMap(h => h.text.match(/PENTARYN_DICE\.[\w.]+/g));
  assert.ok(used.length >= 12, "the sidebar strings are literals");
  for (const key of used) assert.ok(key in keys, `${key} missing from lang/en.json`);
});

test("no prefix wrapper: keys are full literals (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
  ];
  assert.deepEqual(hits, []);
});
