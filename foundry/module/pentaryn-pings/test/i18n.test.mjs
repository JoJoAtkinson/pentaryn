// i18n (guide step 10, J13). The `max` row's label keys resolve in lang/en.json to the English
// the literals used to carry (the settings screen text is unchanged), every PENTARYN_PINGS.* literal
// in the sources exists, there is no prefix wrapper, and module.json pairs `languages` with the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, readJSON, sourceScan } from "./kit/harness.mjs";
import { CSS, FLAG_SCOPE, I18N, NS } from "../pings-core.mjs";
import { SETTINGS } from "../settings.mjs";

const ROOT = new URL("..", import.meta.url);
const manifest = manifestOf(ROOT);

function flatten(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const keys = flatten(readJSON(new URL("lang/en.json", ROOT)));

test("the max row's two keys resolve, rendered verbatim", () => {
  assert.deepEqual(keys, {
    [`${I18N}.Setting.max.Name`]: "Pings to keep",
    [`${I18N}.Setting.max.Hint`]: "How many of the most recent pings to remember. Older ones fall off the end.",
  });
});

test("every non-store SETTINGS row carries literal name and hint keys present in lang; the store row has none", () => {
  for (const row of SETTINGS) {
    if (row.store) {
      assert.equal(row.name, undefined, `${row.key}: a store row has no label`);
      continue;
    }
    for (const f of ["name", "hint"]) assert.ok(row[f] in keys, `${row.key}.${f} ${row[f]} missing from lang/en.json`);
  }
});

test("every PENTARYN_PINGS.* literal in the sources exists in lang/en.json", () => {
  const used = sourceScan(ROOT, /["'`]PENTARYN_PINGS\.[\w.]+["'`]/)
    .flatMap(h => h.text.match(/PENTARYN_PINGS\.[\w.]+/g));
  assert.ok(used.length >= 2, "the max row's name and hint are literals");
  for (const key of used) assert.ok(key in keys, `${key} missing from lang/en.json`);
});

test("no prefix wrapper: keys are full literals (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
  ];
  assert.deepEqual(hits, []);
});

test("module.json: languages names lang/en.json; flags.pentaryn matches core's NS, CSS and FLAG_SCOPE", () => {
  assert.deepEqual(manifest.languages, [{ lang: "en", name: "English", path: "lang/en.json" }]);
  const f = manifest.flags.pentaryn;
  assert.deepEqual([f.namespace, f.cssPrefix, f.flagScope], [NS, CSS, FLAG_SCOPE]);
});
