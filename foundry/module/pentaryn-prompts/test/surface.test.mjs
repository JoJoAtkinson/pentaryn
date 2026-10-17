/**
 * Characterisation (prompts checkpoint, wave 3; guide step 2, prompts-lookup-20): the export
 * surface of every module file — the four pure cores by name, the glue files by name and type —
 * and VERSION against module.json. A refactor that moves a name keeps it importable from the file
 * the goldens name (or updates only the import path). Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { installWorld } from "./fixtures/world.mjs";

const CORES = ["geometry-core", "build-core", "npc-core", "readback-core"];
const GLUE = ["markers", "model", "los", "crops", "gather", "replace", "patch", "character", "npc", "typeahead", "dialog", "prompts"];
/** Import paths only: the golden keeps each file's old name; guide step 10 renamed the adapters. */
const PATH = { markers: "markers-adapter", model: "scene-adapter", los: "sight-adapter", crops: "crops-adapter",
  patch: "actor-patch-adapter", character: "character-adapter", npc: "npc-adapter", typeahead: "typeahead-adapter" };

test("core exports (geometry-core 83, build-core 33, npc-core 14, readback-core 10) load with no Foundry", async () => {
  const out = {};
  for (const f of CORES) out[f] = Object.keys(await import(`../${f}.mjs`)).sort();
  assert.deepEqual(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])),
    { "geometry-core": 83, "build-core": 33, "npc-core": 14, "readback-core": 10 });
  pinJSON("core-exports", out, import.meta.url);
});

test("glue exports by name and type (prompts.mjs exports nothing)", async () => {
  await installWorld();
  const out = {};
  for (const f of GLUE) {
    const m = await import(`../${PATH[f] ?? f}.mjs`);
    out[f] = Object.keys(m).sort().map(k => [k, typeof m[k]]);
  }
  pinJSON("glue-exports", out, import.meta.url);
  assert.deepEqual(out.prompts, []);
});

test("VERSION is module.json's version", async () => {
  const { VERSION } = await import("../geometry-core.mjs");
  assert.equal(VERSION, manifestOf(new URL("..", import.meta.url)).version);
  assert.equal(VERSION, "0.4.6");
});
