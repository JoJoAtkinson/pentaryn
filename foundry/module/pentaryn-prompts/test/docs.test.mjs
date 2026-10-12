/**
 * Docs guard (guide step 18, prompts-lookup-27): the README's "Errors are" paragraph names every
 * code the module throws (CODES), and the README keeps the blueprint's section order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CODES } from "../geometry-core.mjs";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("prompts-lookup-27: every CODES entry is in the README's \"Errors are\" paragraph", () => {
  const start = README.indexOf("Errors are");
  assert.ok(start >= 0);
  const end = README.indexOf("\n\n", start);
  const para = README.slice(start, end < 0 ? undefined : end);
  for (const c of CODES) assert.ok(para.includes(`\`${c}\``), c);
  for (const c of ["MODULE_MISSING", "TIMEOUT"]) assert.ok(para.includes(`\`${c}\``), c);
});

test("README: a Read-this-when line and the blueprint's sections in order", () => {
  assert.ok(README.includes("**Read this when:**"));
  const heads = [...README.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  const want = ["What the player sees", "Settings", "API", "Data written", "Flags other modules read", "Events",
    "Patches and adjustments", "Two sessions", "Extending", "Pitfalls", "Files", "Tests", "Sync"];
  let at = -1;
  for (const w of want) {
    const i = heads.findIndex(h => h.startsWith(w));
    assert.ok(i > at, `## ${w}`);
    at = i;
  }
});

test("aoe-movement-portals-38: isScaffold's docblock and the README point at markers.md's \"Who checks\" table", () => {
  const src = readFileSync(new URL("../scene-adapter.mjs", import.meta.url), "utf8");
  const at = src.indexOf("function isScaffold(");
  assert.ok(at > 0);
  const doc = src.slice(src.lastIndexOf("/**", at), at);
  for (const s of ["context/foundry/markers.md", "Who checks for Markers and crowd", "isScenery", "isCreature", "Not merged on purpose"]) {
    assert.ok(doc.includes(s), s);
  }
  const flags = README.slice(README.indexOf("## Flags other modules read"), README.indexOf("## Events"));
  assert.ok(flags.includes("context/foundry/markers.md"));
});
