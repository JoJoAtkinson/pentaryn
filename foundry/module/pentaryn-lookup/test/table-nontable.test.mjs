// R3 [declared]: an embedded `.RollTable.` uuid that resolves to something that is not a roll table
// (a JournalEntry, a doc with no results) made readTable throw on `t.results.contents`, and the
// whole page() call threw with it. readTable now answers null for any document without
// `results.contents`, so withTables lists that uuid as `{ uuid, error: "not found" }` and the rest
// of the page still answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import { readTable } from "../packs-adapter.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

const GONE = "Compendium.dnd-players-handbook.tables.RollTable.tblGone";
const notATable = { documentName: "JournalEntry", id: "tblGone", name: "Not A Table", pages: [] };

async function withNonTable(fn) {
  const saved = globalThis.fromUuid;
  globalThis.fromUuid = async uuid => (uuid === GONE ? notATable : saved(uuid));
  try { return await fn(); } finally { globalThis.fromUuid = saved; }
}

test("R3: readTable of a `.RollTable.` uuid that resolves to a non-table answers null, not a TypeError", async () => {
  assert.equal(await withNonTable(() => readTable(GONE)), null);
});

test("R3: readTable of a document whose results has no contents answers null", async () => {
  const saved = globalThis.fromUuid;
  globalThis.fromUuid = async () => ({ name: "Odd", formula: "1d4", results: {} });
  try { assert.equal(await readTable(GONE), null); } finally { globalThis.fromUuid = saved; }
});

test("R3: page() with an embedded non-table uuid lists it as not found and still answers the rest", async () => {
  const out = await withNonTable(() => rules.page("Artifacts"));
  assert.equal(out.page, "Artifacts");
  assert.equal(out.tables.length, 2);
  assert.equal(out.tables[0].name, "Minor Beneficial Properties");
  assert.deepEqual(out.tables[1], { uuid: GONE, error: "not found" });
});
