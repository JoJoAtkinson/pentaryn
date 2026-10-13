// journal-EXT-9: journal's pinned-journal rule and cache come from the kit (lib/pins.mjs), the same
// null-safe rule dropbin uses; core keeps re-exporting the names for the older suites.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../journal-core.mjs";
import * as pins from "../lib/pins.mjs";

test("journal-EXT-9: journal-core's pinnedEntryIds and makePinnedCache are the kit's", () => {
  assert.equal(core.pinnedEntryIds, pins.pinnedEntryIds);
  assert.equal(core.makePinnedCache, pins.makePinnedCache);
  assert.deepEqual([...core.pinnedEntryIds([null, {}, { notes: [null] }])], []);
});
