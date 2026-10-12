/**
 * study.mjs's public surface (guide S4b, ties-35): the export names, pinned against the unsplit file
 * (golden/study-exports.json) so the split behind the barrel can be proven to keep every name a
 * console macro or another file imports. The import needs the kit stub: study.mjs draws its inspect
 * session id from foundry.utils.randomID at module scope.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld } from "./fixtures/world.mjs";

await bootWorld({ importEntry: false });

test("study.mjs export names (the barrel S4b must keep)", async () => {
  const names = Object.keys(await import("../study.mjs")).sort();
  pinJSON("study-exports", names, import.meta.url);
  assert.ok(names.length >= 42, `${names.length} exports`);
});
