// Core characterisation (guide step 2). lookup-core is imported FIRST and bare — no Foundry globals
// are installed in this file — which is the purity proof.
import * as core from "../lookup-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("lookup-core loads with no Foundry globals", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas"]) assert.equal(globalThis[g], undefined, g);
});

test("every export the legacy suite imports exists", () => {
  for (const name of [
    "toPlainText", "searchBooks", "findPage", "renderPage", "monsterDigest", "pageUuid", "actorUuid",
    "snippetAround", "capPayload", "embeddedTableUuids", "renderTable",
  ]) assert.equal(typeof core[name], "function", name);
  assert.equal(typeof core.LIMITS, "object");
});

// prompts-lookup-28 (lookup half): lookup's toPlainText and prompts' stripHtml do the same job under
// different contracts. The same seven inputs live in prompts' suite with ITS outputs; each module pins
// its own, so unifying them is a deliberate diff, never a drive-by "fix".
const HTML_TABLE = [
  ["<p>a</p><p>b</p>", "a b"],
  ["@UUID[Compendium.x]{Cover}", "Cover"],
  ["&amp;Reference[prone]", "prone"],
  ["[[/r 2d6]]", "r 2d6"],
  ["A &mdash; B &#39;c&#39;", "A — B 'c'"],
  ["<script>x</script>y", "y"],
  ["@Embed[Compendium.p.RollTable.t rollable]{T}", "@Embed[Compendium.p.RollTable.t rollable]{T}"],
];

test("prompts-lookup-28: toPlainText over the shared HTML-to-text table", () => {
  assert.deepEqual(HTML_TABLE.map(([html]) => core.toPlainText(html)), HTML_TABLE.map(([, want]) => want));
});

test("toPlainText: non-strings and empty give the empty string", () => {
  for (const v of [undefined, null, 0, {}, ""]) assert.equal(core.toPlainText(v), "");
});
