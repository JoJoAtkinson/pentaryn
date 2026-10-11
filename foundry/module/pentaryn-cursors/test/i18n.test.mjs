// i18n characterisation (guide step 1.6). Keys are compared after flattening, so the flat file of
// today and the nested file of guide step 9 resolve to the same keys; the two rendered strings are
// pinned verbatim and are the oracle for that step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { I18N } from "../cursors-core.mjs";

const ROOT = new URL("..", import.meta.url);

function flatten(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const keys = flatten(readJSON(new URL("lang/en.json", ROOT)));

test("the setting's two keys resolve, rendered verbatim", () => {
  assert.deepEqual(keys, {
    [`${I18N}.Setting.enabled.Name`]: "Tool cursors on the map",
    [`${I18N}.Setting.enabled.Hint`]: "Show the active scene tool on the mouse pointer over the map: red crosshair for Target, gold ruler for Ruler, cyan chevrons while placing a spell area, pink pin for Journal notes, green pencil for drawing. Select is always the normal arrow. Turn off if your browser or OS has trouble with custom cursors. Only affects this browser.",
  });
});

test("every PENTARYN_CURSORS.* literal in the sources exists in lang/en.json", () => {
  const used = sourceScan(ROOT, /["'`]PENTARYN_CURSORS\.[\w.]+["'`]/)
    .flatMap(h => h.text.match(/PENTARYN_CURSORS\.[\w.]+/g));
  assert.ok(used.length >= 2, "the setting's name and hint are literals");
  for (const key of used) assert.ok(key in keys, `${key} missing from lang/en.json`);
});

test("no prefix wrapper: keys are full literals (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
  ];
  assert.deepEqual(hits, []);
});
