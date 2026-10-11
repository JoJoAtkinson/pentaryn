// The core seams added by guide step 2 (items-journal-2): the core loads bare, VERSION matches
// module.json, `versionProblems` reproduces the gate's problem list (the strings are the snapshot's
// :373–437 template text, also pinned end to end by glue.test's refusals), and `getPath` is Foundry's
// `getProperty` on plain JSON (the oracle's pasted copy is the reference).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../importer-core.mjs";
import { manifestOf } from "./kit/harness.mjs";
import { getProperty } from "./fixtures/legacy-importer.mjs";

const ROOT = new URL("..", import.meta.url);

test("the core is imported bare: no Foundry global exists in this process", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas"]) assert.equal(g in globalThis, false, g);
});

test("VERSION === module.json version; the blueprint names", () => {
  assert.equal(core.VERSION, manifestOf(ROOT).version);
  assert.equal(core.MODULE, manifestOf(ROOT).id);
  assert.deepEqual(
    [core.SHORT, core.NS, core.CONTRACT, core.I18N, core.CSS],
    ["importer", "importer", "pentaryn-importer/api@1", "PENTARYN_IMPORTER", "pim-"],
  );
  assert.deepEqual(core.HOOKS, {});
  assert.notEqual(core.CONTRACT, core.CONTRACT_ID, "the API contract is not the actors.json contract");
});

const EXPECTED = { contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14 };
const LIVE = { systemId: "dnd5e", systemVersion: "6.0.6", generation: 14, version: "14.369" };
const MANIFEST = { $contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14, actors: [] };

test("versionProblems: a matching manifest passes", () => {
  assert.deepEqual(core.versionProblems(MANIFEST, EXPECTED, LIVE), []);
});

test("versionProblems: targetSystemVersion 5.3 → both minor-version problems, today's text", () => {
  assert.deepEqual(core.versionProblems({ ...MANIFEST, targetSystemVersion: "5.3" }, EXPECTED, LIVE), [
    'targetSystemVersion is "5.3" but the installed dnd5e is 6.0.6 (major.minor 6.0). dnd5e minor releases move the activity schema; refusing.',
    'targetSystemVersion is "5.3" but module.json expects "6.0".',
  ]);
});

test("versionProblems: every rule at once, in the gate's order", () => {
  const got = core.versionProblems({}, { ...EXPECTED, contract: "x@0" }, LIVE);
  assert.equal(got.length, 9);
  assert.match(got[0], /^module\.json declares contract "x@0"/);
  assert.match(got[1], /^\$contract is undefined/);
  assert.match(got[6], /^generation is undefined but this Foundry is generation 14 \(14\.369\)\.$/);
  assert.equal(got[8], "`actors` is missing or is not an array.");
  assert.equal(core.versionProblems(null, EXPECTED, LIVE).length, 8);
});

test("getPath: Foundry's getProperty on plain JSON, edge cases included", () => {
  const cases = [
    [{ a: { b: 1 } }, "a.b"], [{ "a.b": 2, a: { b: 1 } }, "a.b"], [{ a: null }, "a.b"], [{ a: "s" }, "a.length"],
    [{ a: [{ b: 3 }] }, "a.0.b"], [null, "a"], [{ a: 1 }, ""], [{}, "a.b.c"],
  ];
  for (const [obj, key] of cases) assert.deepEqual(core.getPath(obj, key), getProperty(obj, key), `${JSON.stringify(obj)} ${key}`);
  assert.throws(() => core.getPath("a string", "x"), TypeError);
  assert.throws(() => getProperty("a string", "x"), TypeError);
});
