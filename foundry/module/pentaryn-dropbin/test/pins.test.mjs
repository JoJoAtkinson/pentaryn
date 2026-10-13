// journal-EXT-9: dropbin's pinned-journal rule was a drifted copy of journal's and threw on a scene
// without notes or a missing scene list. Both modules now use the kit's one null-safe rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../dropbin-core.mjs";
import * as pins from "../lib/pins.mjs";

test("journal-EXT-9: dropbin's pinnedEntryIds is the kit's, and null-safe", () => {
  assert.equal(core.pinnedEntryIds, pins.pinnedEntryIds, "dropbin-core re-exports the kit's rule");
  assert.deepEqual([...core.pinnedEntryIds(undefined)], []);
  assert.deepEqual([...core.pinnedEntryIds([null, {}, { notes: null }, { notes: [null, { entryId: "a" }] }])], ["a"]);
});
