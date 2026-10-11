// i18n (guide steps 7 and 10, senses-walls-cursors-36). The lang file is written and proved here, but
// it waits as test/fixtures/lang-en.wave7.json: module.json has no `languages` entry yet, so the
// SETTINGS/KEYBINDINGS rows and the toasts keep their literal English (a lang/ file nothing uses
// would only fail C35). The Wave 7 batch moves it to lang/en.json with the `languages` entry and
// switches the rows and toasts to its keys (that needs the frozen glue (a) register pin edited, an
// Open-for-Joe item like pings' J13).
import { test } from "node:test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { manifestOf, readJSON, sourceScan } from "./kit/harness.mjs";
import { I18N } from "../walls-core.mjs";
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
const LANG = new URL("test/fixtures/lang-en.wave7.json", ROOT);
const keys = flatten(readJSON(LANG));
/** Foundry's I18n#format: `{name}` placeholders from data. */
const format = (key, data = {}) => keys[key].replace(/{[^}]+}/g, k => String(data[k.slice(1, -1)]));
const K = `${I18N}.`;

test("the prepared lang file is nested under one root", () => {
  assert.deepEqual(Object.keys(readJSON(LANG)), [I18N]);
});

test("KNOWN senses-walls-cursors-36: no languages entry yet, so the rows keep literal English", () => {
  assert.equal("languages" in manifestOf(ROOT), false);
  assert.equal(existsSync(new URL("lang", ROOT)), false);
  assert.deepEqual(sourceScan(ROOT, /PENTARYN_WALLS\.|game\.i18n\.|_loc\(/), []);
});

test("every row label has a key that renders the same text (the hint drops the stale count)", () => {
  const [backend] = SETTINGS;
  assert.equal(keys[`${K}settings.backend.name`], backend.name);
  assert.equal(keys[`${K}settings.backend.hint`], backend.hint.replace("the same 44 fixtures", "the same fixture corpus"));
  for (const [k, v] of Object.entries(backend.choices)) assert.equal(keys[`${K}settings.backend.choices.${k}`], v, k);
  for (const row of KEYBINDINGS) {
    assert.equal(keys[`${K}keys.${row.key}.name`], row.name, row.key);
    assert.equal(keys[`${K}keys.${row.key}.hint`], row.hint, row.key);
  }
});

test("every toast key renders today's literal (the -36 recipe)", () => {
  assert.equal(format(`${K}notify.undone`, { created: 2, restored: 1 }), "Undid 2 created, 1 restored.");
  assert.equal(format(`${K}notify.backendUnavailable`, { want: "wasm" }), 'Wall autocomplete: backend "wasm" unavailable, using JavaScript.');
  assert.equal(format(`${K}notify.failed`, { message: "x" }), "Wall autocomplete: x");
  assert.equal(format(`${K}notify.nothingToUndo`), "Wall autocomplete: nothing of mine on this scene to undo.");
  assert.equal(format(`${K}notify.macroReady`, { name: "Walls: run" }), 'Macro "Walls: run" ready on the hotbar.');
  assert.equal(format(`${K}notify.busy`), "Wall autocomplete is already running.");
});

test("no prefix wrapper: keys are full literals (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
  ];
  assert.deepEqual(hits, []);
});
