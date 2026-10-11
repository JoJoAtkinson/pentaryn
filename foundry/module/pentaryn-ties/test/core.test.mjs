/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 item 7, pre-S3 form): the pure constants and
 * clamps of ties-api.mjs over a fixed input table, outputs pinned as they are; and the export list of
 * known-core.mjs before S4 splits it behind a barrel (golden/known-core-exports.json). No Foundry.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise, pinJSON } from "./kit/harness.mjs";
import * as API from "../ties-api.mjs";

const INPUTS = [undefined, null, "x", "3", 1.6, -9, 9, 0, "  word  ", "w".repeat(5000), 2.5, -2.5, "", true, [], {}];

test("constants: MODULE, FLAG, LEGACY_SCOPE, STANCES, STRENGTHS, NOTES_MAX, WORD_MAX", () => {
  pinJSON(
    "core-constants",
    {
      MODULE: API.MODULE,
      FLAG: API.FLAG,
      LEGACY_SCOPE: API.LEGACY_SCOPE,
      STANCES: API.STANCES,
      STRENGTHS: API.STRENGTHS,
      NOTES_MAX: API.NOTES_MAX,
      WORD_MAX: API.WORD_MAX,
    },
    import.meta.url
  );
});

for (const name of ["clampStance", "clampStrength", "clampNotes", "clampWord", "stanceOf"]) {
  test(`${name} over the clamp table`, async () => {
    await characterise(`core-${name}`, v => API[name](v), INPUTS.map(v => [v]), {
      file: import.meta.url,
      normalise: v => (typeof v === "string" && v.length > 64 ? { length: v.length, head: v.slice(0, 8) } : v),
    });
  });
}

test("known-core.mjs export names (the barrel S4 must keep)", async () => {
  const names = Object.keys(await import("../known-core.mjs")).sort();
  pinJSON("known-core-exports", names, import.meta.url);
  assert.ok(names.length > 100);
});

test("ties-api.mjs export names", () => {
  pinJSON("ties-api-exports", Object.keys(API).sort(), import.meta.url);
});
