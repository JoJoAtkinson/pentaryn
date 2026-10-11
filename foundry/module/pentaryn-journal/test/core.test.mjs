// Core characterisation (guide step 1.4). journal-core is imported first and bare (the purity proof).
// The glue decisions (items-journal-34) are pinned as full truth tables in goldens, and every entry of
// fixtures/impls.mjs (oracle today, the core from step 2) must reproduce them.
import * as core from "../journal-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { IMPLS } from "./fixtures/impls.mjs";

/** Every combination of the named booleans (plus `undefined` where a field may be absent). */
function* cases(fields, extra = {}) {
  const keys = Object.keys(fields);
  const rec = function* (i, acc) {
    if (i === keys.length) { yield { ...acc }; return; }
    for (const v of fields[keys[i]]) yield* rec(i + 1, { ...acc, [keys[i]]: v });
  };
  yield* rec(0, extra);
}
const B = [false, true];
const BAR = { isJournalEntry: B, isPersonal: B, inPack: B, isGM: B, gmButton: B, observer: B, owner: B };
const ITEM = { hasSource: B, canInspectItems: [false, true, undefined], isGM: B, gmButton: B, observer: B, owner: B };
const SINGLE = { isGM: B, setting: B, isPersonal: B, isEyeReadable: B, visiblePages: [0, 1, 2] };
const table = (fn, fields) => [...cases(fields)].map(input => ({ input, out: fn(input) }));

test("journal-core loads with no Foundry globals", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas"]) assert.equal(globalThis[g], undefined, g);
});

for (const [label, M] of IMPLS) {
  test(`${label}: barVisible truth table (golden/bar-visible.json)`, () => {
    pinJSON("bar-visible", table(M.barVisible, BAR), import.meta.url);
    const P = { isJournalEntry: true, isPersonal: false, inPack: false, isGM: false, gmButton: false, observer: true, owner: false };
    assert.equal(M.barVisible({ ...P, isGM: true, gmButton: false }), false);
    assert.equal(M.barVisible({ ...P, isGM: true, gmButton: true }), true);
    assert.equal(M.barVisible(P), true);
    assert.equal(M.barVisible({ ...P, owner: true }), false);
    assert.equal(M.barVisible({ ...P, isPersonal: true }), false);
    assert.equal(M.barVisible({ ...P, inPack: true }), false);
    assert.equal(M.barVisible({ ...P, isJournalEntry: false }), false);
  });

  test(`${label}: itemBarVisible truth table (golden/item-bar-visible.json)`, () => {
    pinJSON("item-bar-visible", table(M.itemBarVisible, ITEM), import.meta.url);
    assert.equal(M.itemBarVisible({ hasSource: true, canInspectItems: false, isGM: true, gmButton: true, observer: true, owner: false }), false);
  });

  test(`${label}: singlePage truth table (golden/single-page.json)`, () => {
    pinJSON("single-page", table(M.singlePage, SINGLE), import.meta.url);
    const S = { isGM: false, setting: true, isPersonal: false, isEyeReadable: true, visiblePages: 1 };
    assert.equal(M.singlePage(S), true);
    assert.equal(M.singlePage({ ...S, visiblePages: 2 }), false);
    assert.equal(M.singlePage({ ...S, isGM: true }), false);
  });

  test(`${label}: placeFrom`, () => {
    assert.equal(M.placeFrom({ navName: " Old Gate ", folderName: "F" }), "Old Gate");
    assert.equal(M.placeFrom({ navName: "   ", folderName: "F" }), "F");
    assert.equal(M.placeFrom({}), null);
    assert.equal(M.placeFrom({ navName: null, folderName: "" }), null);
  });

  test(`${label}: isPersonal / isMine over hostile shapes`, () => {
    const mine = { documentName: "JournalEntry", flags: { "pentaryn-journal": { kind: "personal", userId: "u" } } };
    assert.equal(M.isPersonal(mine), true);
    assert.equal(M.isMine(mine, "u"), true);
    assert.equal(M.isMine(mine, "v"), false);
    for (const bad of [null, undefined, {}, { documentName: "JournalEntry" }, { documentName: "JournalEntry", flags: { "pentaryn-journal": { kind: "other", userId: "u" } } },
      { documentName: "Item", flags: { "pentaryn-journal": { kind: "personal", userId: "u" } } }]) {
      assert.equal(M.isPersonal(bad), false, JSON.stringify(bad));
      assert.equal(M.isMine(bad, "u"), false);
    }
  });
}

test("items-journal-32: core.escapeHTML pin", () => {
  assert.equal(core.escapeHTML(`<a href="x">'&"</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/a&gt;");
});
