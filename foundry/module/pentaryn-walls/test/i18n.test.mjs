// i18n (guide steps 7 and 10, senses-walls-cursors-36; W2-WALLS-1/-3, Joe 2026-10-12). The Wave 7 batch
// moved the prepared test/fixtures/lang-en.wave7.json to lang/en.json together with module.json
// `languages`, and switched the SETTINGS/KEYBINDINGS rows and the toasts to full-key literals. The text
// behind every key is the English the literals carried, except the backend hint's stale fixture count
// (-8): "the same 44 fixtures" → "the same fixture corpus".
import { test } from "node:test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { manifestOf, readJSON, sourceScan } from "./kit/harness.mjs";
import { CSS, FLAG_SCOPE, I18N, NS } from "../walls-core.mjs";
import { KEYBINDINGS, SETTINGS } from "../settings.mjs";

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
const LANG = new URL("lang/en.json", ROOT);
const keys = flatten(readJSON(LANG));
/** Foundry's I18n#format: `{name}` placeholders from data. */
const format = (key, data = {}) => keys[key].replace(/{[^}]+}/g, k => String(data[k.slice(1, -1)]));
const K = `${I18N}.`;

test("module.json pairs `languages` with lang/en.json; the prepared fixture is gone", () => {
  assert.deepEqual(manifest.languages, [{ lang: "en", name: "English", path: "lang/en.json" }]);
  assert.equal(existsSync(new URL("test/fixtures/lang-en.wave7.json", ROOT)), false);
});

test("the lang file is nested under one root", () => {
  assert.deepEqual(Object.keys(readJSON(LANG)), [I18N]);
});

test("every row label is a full-key literal present in lang/en.json", () => {
  const [backend] = SETTINGS;
  assert.equal(backend.name, `${K}settings.backend.name`);
  assert.equal(backend.hint, `${K}settings.backend.hint`);
  for (const [k, v] of Object.entries(backend.choices)) assert.equal(v, `${K}settings.backend.choices.${k}`, k);
  for (const row of KEYBINDINGS) {
    assert.equal(row.name, `${K}keys.${row.key}.name`, row.key);
    assert.equal(row.hint, `${K}keys.${row.key}.hint`, row.key);
  }
  for (const row of [...SETTINGS, ...KEYBINDINGS]) {
    for (const f of ["name", "hint"]) assert.ok(row[f] in keys, `${row.key}.${f}`);
  }
});

test("the keys render the English the rows carried before the switch (the hint drops the stale count)", () => {
  assert.deepEqual(
    [keys[`${K}settings.backend.name`], keys[`${K}settings.backend.hint`]],
    ["Engine backend",
      "Automatic uses the compiled (WASM) engine when it loads, falling back to JavaScript. Both produce identical "
      + "geometry — verified against the same fixture corpus — so this only affects speed. Compiled is ~12x faster on large scenes."],
  );
  assert.deepEqual([keys[`${K}settings.backend.choices.auto`], keys[`${K}settings.backend.choices.wasm`], keys[`${K}settings.backend.choices.js`]],
    ["Automatic (compiled when available)", "Compiled (WASM)", "JavaScript"]);
  assert.deepEqual(KEYBINDINGS.map(r => [keys[r.name], keys[r.hint]]), [
    ["Wall autocomplete: run", "Complete the walls on the current scene. Reversible — undo removes exactly this run."],
    ["Wall autocomplete: undo last run", "Remove the walls the last run created and restore any it trimmed. Press again to peel back the run before it."],
    ["Wall autocomplete: preview", "Report what would be built without writing anything."],
  ]);
});

test("every toast key renders today's literal (the -36 recipe)", () => {
  assert.equal(format(`${K}notify.undone`, { created: 2, restored: 1 }), "Undid 2 created, 1 restored.");
  assert.equal(format(`${K}notify.backendUnavailable`, { want: "wasm" }), 'Wall autocomplete: backend "wasm" unavailable, using JavaScript.');
  assert.equal(format(`${K}notify.failed`, { message: "x" }), "Wall autocomplete: x");
  assert.equal(format(`${K}notify.nothingToUndo`), "Wall autocomplete: nothing of mine on this scene to undo.");
  assert.equal(format(`${K}notify.macroReady`, { name: "Walls: run" }), 'Macro "Walls: run" ready on the hotbar.');
  assert.equal(format(`${K}notify.busy`), "Wall autocomplete is already running.");
});

test("every PENTARYN_WALLS.* literal in the sources exists in lang/en.json; no raw toast is left", () => {
  const used = sourceScan(ROOT, /["'`]PENTARYN_WALLS\.[\w.]+["'`]/)
    .flatMap(h => h.text.match(/PENTARYN_WALLS\.[\w.]+/g));
  assert.ok(used.length >= 17, `${used.length} literals`);   // 5 setting, 6 keybinding, 6 toast
  for (const key of used) assert.ok(key in keys, `${key} missing from lang/en.json`);
  assert.deepEqual(sourceScan(ROOT, /ui\.notifications\.(?:info|warn|error)\(/), []);
});

test("no prefix wrapper: keys are full literals (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
  ];
  assert.deepEqual(hits, []);
});

// flagScope stays "wall-autocomplete": the flag-scope DATA migration (→ pentaryn-walls) is parked while
// walls stays off in Joe's world (Joe 2026-10-11/-12), so the manifest keeps naming the scope the code writes.
test("module.json flags.pentaryn matches core's NS, CSS and FLAG_SCOPE", () => {
  const f = manifest.flags.pentaryn;
  assert.deepEqual([f.tier, f.namespace, f.cssPrefix, f.flagScope], ["full", NS, CSS, FLAG_SCOPE]);
  assert.equal(FLAG_SCOPE, "wall-autocomplete");
});
