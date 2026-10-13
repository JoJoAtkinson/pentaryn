// creatures-M8: the entry's header lists its files but must not claim they are in load order —
// the imports run core, settings, api, the kit, then the features, so "in load order" was untrue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../creatures.mjs", import.meta.url), "utf8");
const header = src.slice(0, src.indexOf("*/"));

test("creatures-M8: entry header says 'Files (core first, then the features, then the API):', not 'in load order'", () => {
  assert.ok(!/in load order/.test(header), "header still claims load order");
  assert.match(header, / \* Files \(core first, then the features, then the API\):\n/);
});

test("creatures-M8: every file the entry header lists exists", () => {
  const listed = [...header.matchAll(/^ \*\s{3}([\w-]+\.mjs)\s/gm)].map(m => m[1]);
  assert.ok(listed.length >= 9, `listed ${listed.length}`);
  for (const f of listed) assert.doesNotThrow(() => readFileSync(new URL(`../${f}`, import.meta.url)), f);
});
