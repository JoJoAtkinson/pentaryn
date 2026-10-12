// i18n (guide step 8, lang-switch): the module's strings are lang/en.json, read through `_loc` with
// full-key literals (lang-switch.test proves every key and placeholder). The file's values are the old
// inline STRINGS table, byte for byte, so the switch changes no English a player sees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRINGS } from "./fixtures/legacy-attunement.mjs";

const ROOT = new URL("..", import.meta.url);

test("lang/en.json is the former STRINGS verbatim under PENTARYN_ATTUNEMENT, and languages names it", async () => {
  const { I18N } = await import("../attunement-core.mjs");
  const manifest = JSON.parse(readFileSync(new URL("module.json", ROOT), "utf8"));
  assert.deepEqual(manifest.languages, [{ lang: "en", name: "English", path: "lang/en.json" }]);
  assert.deepEqual(JSON.parse(readFileSync(new URL("lang/en.json", ROOT), "utf8")), { [I18N]: STRINGS });
});
