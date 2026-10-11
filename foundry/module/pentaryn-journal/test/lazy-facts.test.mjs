// The core visibility rules read their facts lazily (guide step 2 follow-up): the glue passes getters, and
// a fact the old inline short-circuit never evaluated must still never be evaluated — a permission call on
// a null entry or a non-pile item threw, and the every-scene Note scan is the expensive one.
import * as core from "../journal-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

/** A facts object whose getters record the order they were read in; a fact named in `boom` throws. */
function facts(values, boom = []) {
  const read = [];
  const f = {};
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(f, k, { enumerable: true, get() { read.push(k); if (boom.includes(k)) throw new Error(k); return v; } });
  }
  return { f, read };
}

test("barVisible stops at the first deciding fact", () => {
  let { f, read } = facts({ isJournalEntry: false, isPersonal: 0, inPack: 0, isGM: 0, gmButton: 0, observer: 0, owner: 0 },
    ["isPersonal", "inPack", "isGM", "gmButton", "observer", "owner"]);
  assert.equal(core.barVisible(f), false);
  assert.deepEqual(read, ["isJournalEntry"]);
  ({ f, read } = facts({ isJournalEntry: true, isPersonal: false, inPack: false, isGM: true, gmButton: true, observer: 0, owner: 0 },
    ["observer", "owner"]));
  assert.equal(core.barVisible(f), true);
  assert.deepEqual(read, ["isJournalEntry", "isPersonal", "inPack", "isGM", "gmButton"]);
  ({ f, read } = facts({ isJournalEntry: true, isPersonal: false, inPack: false, isGM: false, gmButton: 0, observer: false, owner: 0 },
    ["gmButton", "owner"]));
  assert.equal(core.barVisible(f), false);
  assert.deepEqual(read, ["isJournalEntry", "isPersonal", "inPack", "isGM", "observer"]);
});

test("itemBarVisible never touches the pile when there is no source", () => {
  const { f, read } = facts({ hasSource: false, canInspectItems: 0, isGM: 0, gmButton: 0, observer: 0, owner: 0 },
    ["canInspectItems", "isGM", "gmButton", "observer", "owner"]);
  assert.equal(core.itemBarVisible(f), false);
  assert.deepEqual(read, ["hasSource"]);
});

test("singlePage skips the Note scan and the page count for a GM or with the setting off", () => {
  let { f, read } = facts({ isGM: true, setting: true, isPersonal: false, isEyeReadable: true, visiblePages: 1 },
    ["setting", "isPersonal", "isEyeReadable", "visiblePages"]);
  assert.equal(core.singlePage(f), false);
  assert.deepEqual(read, ["isGM"]);
  ({ f, read } = facts({ isGM: false, setting: true, isPersonal: false, isEyeReadable: false, visiblePages: 1 }, ["visiblePages"]));
  assert.equal(core.singlePage(f), false);
  assert.deepEqual(read, ["isGM", "setting", "isPersonal", "isEyeReadable"]);
});
