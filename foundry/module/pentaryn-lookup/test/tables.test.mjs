// lookup-edge-1: a v14 document-type roll-table result keeps its label in `name` and leaves
// `description` an empty string, so `description ?? ...` printed only the range ("21"). The row
// reads the first non-empty of description, name, text. readTable no longer touches `r.text`,
// whose read raises v13's TableResult#text deprecation warning on every embedded table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTable } from "../lookup-core.mjs";
import { readTable } from "../packs-adapter.mjs";

test("lookup-edge-1: renderTable prints a v14 document result's name when description is ''", () => {
  const r = renderTable({ name: "Minor", formula: "1d100", uuid: "u", results: [
    { range: [21, 21], description: "", name: "A single row" },
    { range: [22, 22], description: "<p>Text wins.</p>", name: "Label" },
    { range: [23, 23], description: "", name: "", text: "Legacy text" },
    { range: [24, 24], description: "", name: "" },
  ] });
  assert.deepEqual(r.rows, ["21 A single row", "22 Text wins.", "23 Legacy text", "24"]);
});

test("lookup-edge-1: readTable does not read TableResult#text (the v13 deprecation getter)", async () => {
  const saved = globalThis.fromUuid;
  let textReads = 0;
  const result = { range: [1, 1], description: "", name: "Row" };
  Object.defineProperty(result, "text", { get() { textReads++; return ""; }, enumerable: true });
  globalThis.fromUuid = async () => ({ name: "T", formula: "1d1", results: { contents: [result] } });
  try {
    const t = await readTable("Compendium.x.tables.RollTable.t");
    assert.equal(textReads, 0);
    assert.deepEqual(renderTable(t).rows, ["1 Row"]);
  } finally {
    globalThis.fromUuid = saved;
  }
});
